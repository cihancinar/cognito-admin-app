"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Database, Loader2 } from "lucide-react";
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { toast } from "sonner";

interface UserPool {
  Id: string;
  Name: string;
}

export function CognitoPools() {
  const [pools, setPools] = useState<UserPool[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null);

  const dispatchPoolSelectedEvent = useCallback((poolId: string, poolName?: string) => {
    const event = new CustomEvent("cognitoPoolSelected", {
      detail: {
        poolId,
        poolName: poolName || poolId,
      },
    });
    window.dispatchEvent(event);
  }, []);

  useEffect(() => {
    const fetchPools = async () => {
      setIsLoading(true);
      try {
        const res = await fetch("/api/cognito/pools");
        if (!res.ok) {
          throw new Error(`Failed to fetch pools: ${res.status} ${res.statusText}`);
        }
        const data: UserPool[] = await res.json();
        setPools(data);
      } catch (error) {
        console.error("Failed to load pools:", error);
        const errorMessage =
          error instanceof Error
            ? error.message
            : "An unknown error occurred while fetching user pools.";
        toast.error("Error Loading Pools", {
          description: errorMessage,
        });
        setPools([]);
      } finally {
        setIsLoading(false);
      }
    };
    fetchPools();
  }, []);

  const handleSelectPool = useCallback((poolId: string) => {
    setSelectedPoolId(poolId);
    const selectedPool = pools.find((p) => p.Id === poolId);
    dispatchPoolSelectedEvent(poolId, selectedPool?.Name);
  }, [pools, dispatchPoolSelectedEvent]);

  if (isLoading) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <div className="flex items-center px-2 py-1 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            <span>Loading pools...</span>
          </div>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  return (
    <SidebarMenu>
      {pools.length > 0 ? (
        pools.map((pool) => (
          <SidebarMenuItem key={pool.Id}>
            <SidebarMenuButton
              asChild
              isActive={selectedPoolId === pool.Id}
              onClick={() => handleSelectPool(pool.Id)}
            >
              <button type="button" className="w-full">
                <Database className="size-4 shrink-0" />
                <span className="truncate">{pool.Name}</span>
              </button>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))
      ) : (
        <SidebarMenuItem>
          <div className="px-2 py-1 text-sm text-muted-foreground">
            No pools found.
          </div>
        </SidebarMenuItem>
      )}
    </SidebarMenu>
  );
}
