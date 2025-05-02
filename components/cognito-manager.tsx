"use client";

import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ChevronRight, Home, Loader2, Plus } from "lucide-react";

interface Group {
  GroupName: string;
  Description?: string;
}

interface User {
  username: string;
  email: string;
  name?: string;
  "custom:country"?: string;
  "custom:region"?: string;
  "custom:location"?: string;
}

export function CognitoManager() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupUsers, setGroupUsers] = useState<User[]>([]);
  const [searchResults, setSearchResults] = useState<User[]>([]);

  const [selectedPoolId, setSelectedPoolId] = useState<string>("");
  const [selectedPoolName, setSelectedPoolName] = useState<string>("");
  const [selectedGroup, setSelectedGroup] = useState<string>("");
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [emailQuery, setEmailQuery] = useState<string>("");

  const [isLoadingGroups, setIsLoadingGroups] = useState<boolean>(false);
  const [isLoadingGroupUsers, setIsLoadingGroupUsers] = useState<boolean>(false);
  const [isSearchingUsers, setIsSearchingUsers] = useState<boolean>(false);
  const [isAddingUser, setIsAddingUser] = useState<boolean>(false);
  const [isUserSearchOpen, setIsUserSearchOpen] = useState<boolean>(false);

  const resetGroupSelection = useCallback(() => {
    setSelectedGroup("");
    setGroupUsers([]);
    setEmailQuery("");
    setSelectedUser(null);
    setSearchResults([]);
    setIsUserSearchOpen(false);
  }, []);

  const resetPoolSelection = useCallback(() => {
    setSelectedPoolId("");
    setSelectedPoolName("");
    setGroups([]);
    resetGroupSelection();
  }, [resetGroupSelection]);

  useEffect(() => {
    const onPoolSelected = (event: CustomEvent) => {
      setSelectedPoolId(event.detail.poolId);
      setSelectedPoolName(event.detail.poolName || "");
      resetGroupSelection();
    };

    window.addEventListener("cognitoPoolSelected", onPoolSelected as EventListener);
    return () => {
      window.removeEventListener("cognitoPoolSelected", onPoolSelected as EventListener);
    };
  }, [resetGroupSelection]);

  useEffect(() => {
    if (!selectedPoolId) {
      setGroups([]);
      return;
    }

    let isMounted = true;
    const fetchGroups = async () => {
      setIsLoadingGroups(true);
      setGroups([]); // Clear previous groups
      try {
        const res = await fetch(`/api/cognito/pools/${selectedPoolId}/groups`);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const data: Group[] = await res.json();
        if (isMounted) {
          setGroups(data);
        }
      } catch (error: any) {
        console.error("Failed to load groups:", error);
        if (isMounted) {
          toast.error("Error Loading Groups", {
            description: error.message || "Could not fetch groups for the selected pool.",
          });
        }
      } finally {
        if (isMounted) {
          setIsLoadingGroups(false);
        }
      }
    };

    fetchGroups();
    return () => { isMounted = false; };
  }, [selectedPoolId]);

  const fetchGroupUsers = useCallback(async (poolId: string, groupName: string) => {
    setIsLoadingGroupUsers(true);
    setGroupUsers([]);
    let users: User[] = [];
    try {
      const encodedGroup = encodeURIComponent(groupName);
      const res = await fetch(`/api/cognito/pools/${poolId}/groups/${encodedGroup}/users`);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      users = await res.json();
    } catch (error: any) {
      console.error("Failed to load group users:", error);
      toast.error("Error Loading Group Users", {
        description: error.message || "Could not fetch users for the selected group.",
      });
    } finally {
      setGroupUsers(users); // Update state even on error (to show empty list)
      setIsLoadingGroupUsers(false);
    }
  }, []); // Dependencies are passed explicitly when called

  useEffect(() => {
    if (!selectedPoolId || !selectedGroup) {
      setGroupUsers([]);
      return;
    }
    fetchGroupUsers(selectedPoolId, selectedGroup);
  }, [selectedPoolId, selectedGroup, fetchGroupUsers]);

  useEffect(() => {
    if (emailQuery.length < 2 || !selectedPoolId) {
      setSearchResults([]);
      return;
    }

    setIsSearchingUsers(true);
    const timerId = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/cognito/pools/${selectedPoolId}/users?query=${encodeURIComponent(emailQuery)}`
        );
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const data: User[] = await res.json();
        setSearchResults(data);
      } catch (error: any) {
        console.error("Failed to search users:", error);
        setSearchResults([]);
      } finally {
        setIsSearchingUsers(false);
      }
    }, 500);

    return () => clearTimeout(timerId);
  }, [emailQuery, selectedPoolId]);

  const handleAddUser = async () => {
    if (!selectedPoolId || !selectedGroup || !selectedUser) {
      toast.error("Missing Information", {
        description: "Please select a group and a user to add.",
      });
      return;
    }

    setIsAddingUser(true);
    try {
      const encodedGroup = encodeURIComponent(selectedGroup);
      const res = await fetch(
        `/api/cognito/pools/${selectedPoolId}/groups/${encodedGroup}/add`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: selectedUser.username }),
        }
      );

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || `HTTP error! status: ${res.status}`);
      }

      toast.success("Success", {
        description: `User ${selectedUser.email} added to group ${selectedGroup}.`,
      });

      setEmailQuery("");
      setSelectedUser(null);
      setSearchResults([]);
      setIsUserSearchOpen(false);

      // Refetch users for the current group after adding
      await fetchGroupUsers(selectedPoolId, selectedGroup);

    } catch (error: any) {
      console.error("Failed to add user:", error);
      toast.error("Error Adding User", {
        description: error.message || "Could not add the user to the group.",
      });
    } finally {
      setIsAddingUser(false);
    }
  };

  const handleSelectUser = (user: User) => {
    setSelectedUser(user);
    setEmailQuery(user.email);
    setIsUserSearchOpen(false);
    setSearchResults([]);
  };

  const handleGroupSelect = (groupName: string) => {
    setSelectedGroup(groupName);
    setEmailQuery("");
    setSelectedUser(null);
    setSearchResults([]);
    setIsUserSearchOpen(false);
    // User fetching is handled by the useEffect watching selectedGroup
  };

  // removeUserFromGroup function is removed as the UI element was removed previously.

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-2 border-b">
        <div className="flex items-center gap-2 px-4">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="#" onClick={resetPoolSelection}>
                  <Home className="size-4" />
                </BreadcrumbLink>
              </BreadcrumbItem>
              {selectedPoolId && (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbLink href="#" onClick={resetGroupSelection}>
                      {selectedPoolName || selectedPoolId}
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  {selectedGroup && (
                    <>
                      <BreadcrumbSeparator />
                      <BreadcrumbItem>
                        <BreadcrumbPage>{selectedGroup}</BreadcrumbPage>
                      </BreadcrumbItem>
                    </>
                  )}
                </>
              )}
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>

      <main className="p-4 md:p-6 space-y-6">
        {!selectedPoolId && (
          <div className="flex items-center justify-center h-[calc(100vh-10rem)]">
            <p className="text-muted-foreground text-center">
              Please select a User Pool from the sidebar to manage groups and users.
            </p>
          </div>
        )}

        {selectedPoolId && (
          <>
            {isLoadingGroups ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <>
                {!selectedGroup && (
                  <>
                    <h2 className="text-lg font-semibold">Groups</h2>
                    <div className="rounded-md border">
                      <div className="divide-y">
                        {groups.length === 0 ? (
                          <div className="p-4 text-center text-muted-foreground">
                            No groups found in this pool.
                          </div>
                        ) : (
                          groups.map((group) => (
                            <div
                              key={group.GroupName}
                              className="p-3 hover:bg-muted/50 cursor-pointer flex justify-between items-center"
                              onClick={() => handleGroupSelect(group.GroupName)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => e.key === 'Enter' && handleGroupSelect(group.GroupName)}
                            >
                              <div className="flex-1 overflow-hidden">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="font-medium truncate block max-w-full">
                                        {group.GroupName}
                                      </span>
                                    </TooltipTrigger>
                                    {group.Description && (
                                      <TooltipContent>
                                        <p>{group.Description}</p>
                                      </TooltipContent>
                                    )}
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
                              <ChevronRight className="h-4 w-4 text-muted-foreground ml-2 shrink-0" />
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                )}

                {selectedGroup && (
                  <>
                    <h2 className="text-lg font-semibold">Users</h2>
                    <div className="rounded-md border">
                      <div className="p-4 border-b">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                          <div className="col-span-2 space-y-1">
                            <Label htmlFor="emailInput">
                              Search User by Email to Add
                            </Label>
                            <Popover
                              open={isUserSearchOpen}
                              onOpenChange={setIsUserSearchOpen}
                            >
                              <Command shouldFilter={false} className="relative">
                                <PopoverTrigger asChild>
                                  <CommandInput
                                    id="emailInput"
                                    placeholder="Start typing email..."
                                    value={emailQuery}
                                    onValueChange={(value) => {
                                      setEmailQuery(value);
                                      setSelectedUser(null);
                                      if (value.length >= 2) {
                                        setIsUserSearchOpen(true);
                                      } else {
                                        setIsUserSearchOpen(false);
                                        setSearchResults([]);
                                      }
                                    }}
                                    onFocus={() => {
                                      if (emailQuery.length >= 2 || searchResults.length > 0) {
                                        setIsUserSearchOpen(true);
                                      }
                                    }}
                                    onBlur={() => {
                                      setTimeout(() => {
                                        if (!document.activeElement?.closest("[data-radix-popover-content-wrapper]")) {
                                          setIsUserSearchOpen(false);
                                        }
                                      }, 150);
                                    }}
                                    disabled={!selectedPoolId || !selectedGroup}
                                    className="peer"
                                  />
                                </PopoverTrigger>
                                <PopoverContent
                                  className="w-[--radix-popover-trigger-width] p-0"
                                  side="bottom"
                                  align="start"
                                  onOpenAutoFocus={(e) => e.preventDefault()}
                                  onInteractOutside={(e) => {
                                    if (e.target instanceof Element && e.target.closest("[data-radix-popover-trigger]")) {
                                      e.preventDefault();
                                    }
                                  }}
                                >
                                  <CommandList>
                                    {isSearchingUsers && <CommandEmpty>Searching...</CommandEmpty>}
                                    {!isSearchingUsers && searchResults.length === 0 && emailQuery.length >= 2 && (
                                      <CommandEmpty>No users found.</CommandEmpty>
                                    )}
                                    {!isSearchingUsers && searchResults.length > 0 && (
                                      <CommandGroup heading="Suggestions">
                                        {searchResults.map((user) => (
                                          <CommandItem
                                            key={user.username}
                                            value={`${user.email} ${user.username}`}
                                            onSelect={() => handleSelectUser(user)}
                                            className="cursor-pointer"
                                          >
                                            {user.email}{" "}
                                            <span className="ml-2 text-xs text-muted-foreground">
                                              ({user.username})
                                            </span>
                                          </CommandItem>
                                        ))}
                                      </CommandGroup>
                                    )}
                                  </CommandList>
                                </PopoverContent>
                              </Command>
                            </Popover>
                          </div>
                          <Button
                            onClick={handleAddUser}
                            disabled={!selectedUser || isAddingUser}
                            className="w-full"
                          >
                            {isAddingUser ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <Plus className="mr-2 h-4 w-4" />
                            )}
                            {isAddingUser ? "Adding..." : "Add User"}
                          </Button>
                        </div>
                      </div>

                      <div className="p-4">
                        {isLoadingGroupUsers ? (
                          <div className="flex items-center justify-center p-8">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                          </div>
                        ) : groupUsers.length > 0 ? (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-left text-xs text-muted-foreground border-b">
                                  <th className="p-2 font-medium">Email</th>
                                  <th className="p-2 font-medium">Name</th>
                                  <th className="p-2 font-medium">Country</th>
                                  <th className="p-2 font-medium">Region</th>
                                  <th className="p-2 font-medium">Location</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y">
                                {groupUsers.map((user) => (
                                  <tr key={user.username} className="hover:bg-muted/50">
                                    <td className="p-2">{user.email || "-"}</td>
                                    <td className="p-2">{user.name || "-"}</td>
                                    <td className="p-2">{user["custom:country"] || "-"}</td>
                                    <td className="p-2">{user["custom:region"] || "-"}</td>
                                    <td className="p-2">{user["custom:location"] || "-"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="text-center p-4 text-muted-foreground">
                            No users found in this group.
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}