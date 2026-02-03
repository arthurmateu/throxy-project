"use client";

import { useState, useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { useTRPC } from "@/utils/trpc";
import { useQuery } from "@tanstack/react-query";

interface Lead {
  id: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  accountName: string;
  accountDomain: string | null;
  employeeRange: string | null;
  industry: string | null;
  rank: number | null;
  reasoning: string | null;
  relevanceScore: number | null;
}

function getRankBadgeVariant(rank: number | null): "success" | "warning" | "secondary" | "destructive" {
  if (rank === null) return "secondary";
  if (rank <= 3) return "success";
  if (rank <= 6) return "warning";
  return "destructive";
}

export function LeadsTable() {
  const trpc = useTRPC();
  const [sorting, setSorting] = useState<SortingState>([
    { id: "rank", desc: false },
  ]);
  const [showIrrelevant, setShowIrrelevant] = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // Determine sort parameters from TanStack Table state
  const sortBy = sorting[0]?.id === "accountName" 
    ? "company" 
    : sorting[0]?.id === "lastName" 
      ? "name" 
      : "rank";
  const sortOrder = sorting[0]?.desc ? "desc" : "asc";

  const { data, isLoading, error } = useQuery(
    trpc.leads.list.queryOptions({
      page,
      pageSize,
      sortBy: sortBy as "rank" | "name" | "company",
      sortOrder: sortOrder as "asc" | "desc",
      showIrrelevant,
    })
  );

  const columns: ColumnDef<Lead>[] = useMemo(
    () => [
      {
        accessorKey: "rank",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="-ml-4"
          >
            Rank
            {column.getIsSorted() === "asc" ? (
              <ArrowUp className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === "desc" ? (
              <ArrowDown className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        ),
        cell: ({ row }) => {
          const rank = row.getValue("rank") as number | null;
          return (
            <Badge variant={getRankBadgeVariant(rank)}>
              {rank !== null ? rank : "N/A"}
            </Badge>
          );
        },
      },
      {
        accessorKey: "lastName",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="-ml-4"
          >
            Name
            {column.getIsSorted() === "asc" ? (
              <ArrowUp className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === "desc" ? (
              <ArrowDown className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        ),
        cell: ({ row }) => {
          const lead = row.original;
          return (
            <div>
              <div className="font-medium">
                {lead.firstName} {lead.lastName}
              </div>
              <div className="text-sm text-muted-foreground truncate max-w-[200px]">
                {lead.jobTitle}
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "accountName",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="-ml-4"
          >
            Company
            {column.getIsSorted() === "asc" ? (
              <ArrowUp className="ml-2 h-4 w-4" />
            ) : column.getIsSorted() === "desc" ? (
              <ArrowDown className="ml-2 h-4 w-4" />
            ) : (
              <ArrowUpDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        ),
        cell: ({ row }) => {
          const lead = row.original;
          return (
            <div>
              <div className="font-medium">{lead.accountName}</div>
              <div className="text-sm text-muted-foreground">
                {lead.employeeRange || "Unknown size"}
                {lead.industry && ` · ${lead.industry}`}
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "reasoning",
        header: "AI Reasoning",
        cell: ({ row }) => {
          const reasoning = row.getValue("reasoning") as string | null;
          if (!reasoning) return <span className="text-muted-foreground">—</span>;
          return (
            <p className="text-sm text-muted-foreground max-w-[300px] truncate" title={reasoning}>
              {reasoning}
            </p>
          );
        },
      },
    ],
    []
  );

  const table = useReactTable({
    data: data?.leads ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: (updater) => {
      setSorting(updater);
      setPage(1); // Reset to first page on sort change
    },
    state: {
      sorting,
    },
    manualSorting: true, // We handle sorting on the server
    manualPagination: true,
    pageCount: data?.pagination.totalPages ?? 0,
  });

  if (error) {
    return (
      <div className="rounded-md border p-8 text-center text-destructive">
        Error loading leads: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <label className="flex items-center space-x-2 text-sm">
            <input
              type="checkbox"
              checked={showIrrelevant}
              onChange={(e) => {
                setShowIrrelevant(e.target.checked);
                setPage(1);
              }}
              className="h-4 w-4 rounded border-gray-300"
            />
            <span>Show irrelevant leads</span>
          </label>
        </div>
        <div className="text-sm text-muted-foreground">
          {data?.pagination.totalCount ?? 0} total leads
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-6 w-12" /></TableCell>
                  <TableCell>
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  </TableCell>
                  <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                </TableRow>
              ))
            ) : table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No leads found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Page {page} of {data?.pagination.totalPages ?? 1}
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(1)}
            disabled={page === 1}
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(data?.pagination.totalPages ?? 1, p + 1))}
            disabled={page >= (data?.pagination.totalPages ?? 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(data?.pagination.totalPages ?? 1)}
            disabled={page >= (data?.pagination.totalPages ?? 1)}
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
