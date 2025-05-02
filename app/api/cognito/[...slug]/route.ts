import { NextResponse } from 'next/server';
import {
  ListUserPoolsCommand,
  ListGroupsCommand,
  ListUsersCommand,
  ListUsersInGroupCommand,
  AdminAddUserToGroupCommand,
  UserType, // Keep UserType for clarity in mapping
  AttributeType, // Import AttributeType for helper function
} from "@aws-sdk/client-cognito-identity-provider";
import { cognitoClient } from '@/lib/cognito';

// Ensures the route is treated as dynamic, preventing potential caching issues.
export const dynamic = 'force-dynamic';

/**
 * Represents the structure of user data returned by specific API endpoints.
 */
interface CognitoUser {
  username: string | undefined;
  email: string;
  name?: string;
  'custom:country'?: string;
  'custom:region'?: string;
  'custom:location'?: string;
}

/**
 * Defines the expected structure of the route context provided by Next.js App Router.
 */
interface RouteContext {
  params: {
    slug: string[];
  };
}

/**
 * Helper function to safely extract an attribute value from a Cognito user's attribute list.
 * @param attributes - The list of attributes from a Cognito UserType.
 * @param attributeName - The name of the attribute to find.
 * @returns The attribute value or undefined if not found.
 */
const getUserAttribute = (attributes: AttributeType[] | undefined, attributeName: string): string | undefined => {
  return attributes?.find(attr => attr.Name === attributeName)?.Value;
};


// --- GET Handler ---
/**
 * Handles GET requests for various Cognito resources based on the URL slug.
 * Routes:
 * - /api/cognito/pools: Lists user pools.
 * - /api/cognito/pools/{poolId}/groups: Lists groups in a specific pool.
 * - /api/cognito/pools/{poolId}/users?query=...: Searches users in a pool by email prefix.
 * - /api/cognito/pools/{poolId}/groups/{groupName}/users: Lists users within a specific group.
 */
export async function GET(
  request: Request,
  context: RouteContext
) {
  const slug = context.params.slug || [];
  const { searchParams } = new URL(request.url);

  try {
    // Route: /api/cognito/pools
    if (slug.length === 1 && slug[0] === 'pools') {
      const command = new ListUserPoolsCommand({ MaxResults: 60 }); // Increased limit
      const result = await cognitoClient.send(command);
      return NextResponse.json(result.UserPools || []);
    }

    // Route: /api/cognito/pools/{poolId}/groups
    if (slug.length === 3 && slug[0] === 'pools' && slug[2] === 'groups') {
      const userPoolId = slug[1];
      const command = new ListGroupsCommand({ UserPoolId: userPoolId, Limit: 60 }); // Added limit
      const result = await cognitoClient.send(command);
      return NextResponse.json(result.Groups || []);
    }

    // Route: /api/cognito/pools/{poolId}/users?query=... (User Search)
    if (slug.length === 3 && slug[0] === 'pools' && slug[2] === 'users') {
      const userPoolId = slug[1];
      const query = searchParams.get('query');

      if (!query) {
        return NextResponse.json({ error: 'Query parameter is required for user search' }, { status: 400 });
      }

      // Search users where the email starts with the provided query string.
      const command = new ListUsersCommand({
        UserPoolId: userPoolId,
        Filter: `email ^= "${query}"`,
        Limit: 10 // Limit results for typeahead/autocomplete suggestions
      });

      const result = await cognitoClient.send(command);
      // Map results to a simpler format for the frontend.
      const users = (result.Users || []).map(user => ({
        username: user.Username,
        email: getUserAttribute(user.Attributes, 'email') || '(no email)'
      }));
      return NextResponse.json(users);
    }

    // Route: /api/cognito/pools/{poolId}/groups/{groupName}/users (List Users in Group)
     if (slug.length === 5 && slug[0] === 'pools' && slug[2] === 'groups' && slug[4] === 'users') {
      const userPoolId = slug[1];
      const groupName = decodeURIComponent(slug[3]); // Group names can contain special characters.

      let allUsersInGroup: CognitoUser[] = [];
      let nextToken: string | undefined = undefined;

      // Paginate through ListUsersInGroup results if necessary.
      do {
        const command = new ListUsersInGroupCommand({
          UserPoolId: userPoolId,
          GroupName: groupName,
          Limit: 60, // Max limit per request
          NextToken: nextToken
        });
        const result = await cognitoClient.send(command);

        // Map the Cognito UserType to our simplified CognitoUser interface.
        const pageUsers = (result.Users || []).map((user: UserType): CognitoUser => ({
            username: user.Username,
            email: getUserAttribute(user.Attributes, 'email') || '(no email)',
            name: getUserAttribute(user.Attributes, 'name'),
            'custom:country': getUserAttribute(user.Attributes, 'custom:country'),
            'custom:region': getUserAttribute(user.Attributes, 'custom:region'),
            'custom:location': getUserAttribute(user.Attributes, 'custom:location'),
          })
        );
        allUsersInGroup = allUsersInGroup.concat(pageUsers);
        nextToken = result.NextToken;
      } while (nextToken);

      // Although ListUsersInGroup shouldn't return duplicates for a single group,
      // using a Map ensures uniqueness if the logic were ever changed.
      // Primarily used here for potential future-proofing.
      const uniqueUsers = Array.from(new Map(allUsersInGroup.map(u => [u.username, u])).values());

      // Sort users alphabetically by email for consistent display.
      uniqueUsers.sort((a, b) => a.email.localeCompare(b.email));

      return NextResponse.json(uniqueUsers);
    }

    // Fallback for unmatched GET routes
    return NextResponse.json({ error: 'API route not found' }, { status: 404 });

  } catch (err: any) {
    console.error(`Error in GET /api/cognito/${slug.join('/')}:`, err);
    // Handle specific AWS Cognito errors with user-friendly messages.
    if (err.name === 'ResourceNotFoundException') {
       return NextResponse.json({ error: 'Resource not found (e.g., invalid Pool ID or Group Name)' }, { status: 404 });
    }
    if (err.name === 'InvalidParameterException') {
        return NextResponse.json({ error: `Invalid parameter provided: ${err.message}` }, { status: 400 });
    }
    // Generic error for other issues.
    return NextResponse.json({ error: err.message || 'An internal server error occurred' }, { status: 500 });
  }
}

// --- POST Handler ---
/**
 * Handles POST requests for specific Cognito actions.
 * Routes:
 * - /api/cognito/pools/{poolId}/groups/{groupName}/add: Adds a user to a group.
 */
export async function POST(
  request: Request,
  context: RouteContext
) {
  const slug = context.params.slug || [];

  try {
    // Route: /api/cognito/pools/{poolId}/groups/{groupName}/add (Add User to Group)
    if (slug.length === 5 && slug[0] === 'pools' && slug[2] === 'groups' && slug[4] === 'add') {
      const userPoolId = slug[1];
      const groupName = decodeURIComponent(slug[3]);
      let username: string | undefined;

      // Safely parse the request body.
      try {
          const body = await request.json();
          username = body.username;

          if (!username) {
            return NextResponse.json({ error: 'Username is required in the request body' }, { status: 400 });
          }
      } catch (parseError) {
           console.error("Failed to parse request body:", parseError);
           return NextResponse.json({ error: 'Invalid JSON format in request body' }, { status: 400 });
      }

      // Add the specified user to the specified group.
      const command = new AdminAddUserToGroupCommand({
        UserPoolId: userPoolId,
        Username: username,
        GroupName: groupName
      });

      await cognitoClient.send(command);

      // Return a success message (fetching email is omitted for simplicity as it wasn't strictly required by the original code's core function)
      return NextResponse.json({ message: `User ${username} successfully added to group ${groupName}` });
    }

    // Fallback for unmatched POST routes
    return NextResponse.json({ error: 'API route not found or method not allowed' }, { status: 404 });

  } catch (err: any) {
    console.error(`Error in POST /api/cognito/${slug.join('/')}:`, err);
     // Handle specific AWS Cognito errors related to adding users.
     if (err.name === 'UserNotFoundException') {
       return NextResponse.json({ error: `User specified does not exist.` }, { status: 404 });
     }
     if (err.name === 'ResourceNotFoundException') {
         return NextResponse.json({ error: `Group or Pool specified does not exist.` }, { status: 404 });
     }
     if (err.name === 'InvalidParameterException') {
         return NextResponse.json({ error: `Invalid parameter provided: ${err.message}` }, { status: 400 });
     }
     // Generic error for other issues.
    return NextResponse.json({ error: err.message || 'An internal server error occurred' }, { status: 500 });
  }
}