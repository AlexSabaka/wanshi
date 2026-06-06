"use client"

import {
  type ColumnDef,
  type ColumnFiltersState,
  type PaginationState,
  type Row,
  type SortingState,
  type Table as TanstackTable,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, ChevronRight, ChevronsUpDown, ChevronUp, Search, SlidersHorizontal } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { makeStorageKey, useLocalStorageState } from "@/lib/local-storage"

export interface DataTableGroup<TData> {
  key: string
  title: string
  subtitle?: string
  countLabel?: string
  items: TData[]
  headerExtras?: React.ReactNode
}

interface DataTableGrouping<TData> {
  buildGroups: (rows: TData[]) => DataTableGroup<TData>[]
}

interface DataTableExpansion<TData> {
  expandedRowIds: Set<string>
  onToggleRow: (rowId: string) => void
  renderContent: (row: Row<TData>) => React.ReactNode
}

function sanitizeSortingState(value: unknown): SortingState {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is { id: string; desc?: boolean } => (
      typeof item === "object" && item !== null && typeof (item as { id?: unknown }).id === "string"
    ))
    .map((item) => ({ id: item.id, desc: Boolean(item.desc) }))
}

function sanitizeColumnFiltersState(value: unknown): ColumnFiltersState {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is { id: string; value: unknown } => (
      typeof item === "object" && item !== null && typeof (item as { id?: unknown }).id === "string" && "value" in item
    ))
    .map((item) => ({ id: item.id, value: item.value }))
}

function sanitizeColumnVisibilityState(value: unknown): VisibilityState {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value).filter(([, visible]) => typeof visible === "boolean"),
  ) as VisibilityState
}

function sanitizePaginationState(defaultPageSize: number) {
  return (value: unknown): PaginationState => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return { pageIndex: 0, pageSize: defaultPageSize }
    }

    const pageIndex = Number((value as { pageIndex?: unknown }).pageIndex)
    const pageSize = Number((value as { pageSize?: unknown }).pageSize)

    return {
      pageIndex: Number.isFinite(pageIndex) && pageIndex >= 0 ? pageIndex : 0,
      pageSize: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : defaultPageSize,
    }
  }
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  searchKey?: string
  searchPlaceholder?: string
  toolbar?: React.ReactNode | ((table: ReturnType<typeof useReactTable<TData>>) => React.ReactNode)
  loading?: boolean
  /** Called when filtered row set changes — receives the filtered data array */
  onFilteredRowsChange?: (rows: TData[]) => void
  grouping?: DataTableGrouping<TData>
  persistKey?: string
  getRowId?: (row: TData, index: number) => string
  rowExpansion?: DataTableExpansion<TData>
  initialPageSize?: number
  /** Called once after mount with the table instance, for external column selectors */
  onTableReady?: (table: TanstackTable<TData>) => void
  /** Hides the built-in Columns button from the internal toolbar */
  hideColumnSelector?: boolean
}

export function DataTableColumnSelector<TData>({ table }: { table: TanstackTable<TData> }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8">
          <SlidersHorizontal className="mr-2 h-4 w-4" />
          Columns
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {table
          .getAllColumns()
          .filter((col) => col.getCanHide())
          .map((col) => (
            <DropdownMenuCheckboxItem
              key={col.id}
              checked={col.getIsVisible()}
              onCheckedChange={(v: boolean) => col.toggleVisibility(!!v)}
              className="capitalize"
            >
              {col.id.replace(/_/g, " ")}
            </DropdownMenuCheckboxItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchKey,
  searchPlaceholder = "Search...",
  toolbar,
  loading,
  onFilteredRowsChange,
  grouping,
  persistKey,
  getRowId,
  rowExpansion,
  initialPageSize = 20,
  onTableReady,
  hideColumnSelector,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useLocalStorageState<SortingState>(
    persistKey ? makeStorageKey(persistKey, "sorting") : null,
    [],
    { sanitize: sanitizeSortingState },
  )
  const [columnFilters, setColumnFilters] = useLocalStorageState<ColumnFiltersState>(
    persistKey ? makeStorageKey(persistKey, "filters") : null,
    [],
    { sanitize: sanitizeColumnFiltersState },
  )
  const [columnVisibility, setColumnVisibility] = useLocalStorageState<VisibilityState>(
    persistKey ? makeStorageKey(persistKey, "columns") : null,
    {},
    { sanitize: sanitizeColumnVisibilityState },
  )
  const [pagination, setPagination] = useLocalStorageState<PaginationState>(
    persistKey ? makeStorageKey(persistKey, "pagination") : null,
    { pageIndex: 0, pageSize: initialPageSize },
    { sanitize: sanitizePaginationState(initialPageSize) },
  )
  const [rowSelection, setRowSelection] = useState({})
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})

  const table = useReactTable({
    data,
    columns,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    onRowSelectionChange: setRowSelection,
    state: { sorting, columnFilters, columnVisibility, rowSelection, pagination },
    autoResetPageIndex: false,
  })

  // Expose filtered rows to parent
  const filteredRows = table.getFilteredRowModel().rows
  useEffect(() => {
    if (onFilteredRowsChange) {
      onFilteredRowsChange(filteredRows.map((r) => r.original))
    }
  }, [filteredRows, onFilteredRowsChange])

  // Expose table instance to parent for external column selectors
  const onTableReadyRef = useRef(onTableReady)
  onTableReadyRef.current = onTableReady
  useEffect(() => {
    onTableReadyRef.current?.(table)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sortedRows = table.getSortedRowModel().rows
  const filteredRowCount = table.getFilteredRowModel().rows.length

  const groupedRows = useMemo(() => {
    if (!grouping) return []
    return grouping.buildGroups(sortedRows.map((row) => row.original))
  }, [grouping, sortedRows])

  useEffect(() => {
    if (grouping) return

    const pageCount = Math.max(1, Math.ceil(filteredRowCount / Math.max(pagination.pageSize, 1)))
    if (pagination.pageIndex < pageCount) return

    setPagination((previous) => ({
      ...previous,
      pageIndex: Math.max(pageCount - 1, 0),
    }))
  }, [filteredRowCount, grouping, pagination.pageIndex, pagination.pageSize, setPagination])

  useEffect(() => {
    if (!grouping) return

    setExpandedGroups((previous) => {
      const next: Record<string, boolean> = {}
      let changed = false

      for (const group of groupedRows) {
        if (!(group.key in previous)) changed = true
        next[group.key] = previous[group.key] ?? true
      }

      for (const key of Object.keys(previous)) {
        if (!(key in next)) changed = true
      }

      return changed ? next : previous
    })
  }, [grouping, groupedRows])

  const rowLookup = useMemo(() => {
    const lookup = new Map<TData, Row<TData>>()
    for (const row of sortedRows) {
      lookup.set(row.original, row)
    }
    return lookup
  }, [sortedRows])

  const visibleColumnCount = Math.max(table.getVisibleLeafColumns().length, 1)
  const showGroupedRows = !!grouping

  const renderDataRow = (row: Row<TData>) => (
    <Fragment key={row.id}>
      <TableRow data-state={row.getIsSelected() && "selected"}>
        {row.getVisibleCells().map((cell) => (
          <TableCell key={cell.id} className="px-3 py-2 text-sm">
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </TableCell>
        ))}
      </TableRow>
      {rowExpansion && rowExpansion.expandedRowIds.has(row.id) && (
        <TableRow className="bg-muted/20 hover:bg-muted/20">
          <TableCell colSpan={visibleColumnCount} className="px-3 py-0">
            <div className="py-3">{rowExpansion.renderContent(row)}</div>
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  )

  const showToolbar = !!(searchKey || toolbar || !hideColumnSelector)

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      {showToolbar && (
        <div className="flex flex-wrap items-center gap-2">
          {searchKey && (
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={searchPlaceholder}
                value={(table.getColumn(searchKey)?.getFilterValue() as string) ?? ""}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => table.getColumn(searchKey)?.setFilterValue(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
          )}
          {typeof toolbar === "function" ? toolbar(table) : toolbar}
          {!hideColumnSelector && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="ml-auto h-9">
                  <SlidersHorizontal className="mr-2 h-4 w-4" />
                  Columns
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {table
                  .getAllColumns()
                  .filter((col) => col.getCanHide())
                  .map((col) => (
                    <DropdownMenuCheckboxItem
                      key={col.id}
                      checked={col.getIsVisible()}
                      onCheckedChange={(v: boolean) => col.toggleVisibility(!!v)}
                      className="capitalize"
                    >
                      {col.id.replace(/_/g, " ")}
                    </DropdownMenuCheckboxItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => (
                  <TableHead key={header.id} className="h-9 px-3 text-xs">
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        className="flex items-center gap-1 hover:text-foreground"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === "asc" ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : header.column.getIsSorted() === "desc" ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronsUpDown className="h-3 w-3 text-muted-foreground/50" />
                        )}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {columns.map((_, j) => (
                    <TableCell key={j} className="px-3 py-2">
                      <div className="h-4 w-full animate-pulse rounded bg-muted" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : showGroupedRows && groupedRows.length ? (
              groupedRows.map((group) => {
                const isExpanded = expandedGroups[group.key] ?? true
                const rows = group.items
                  .map((item) => rowLookup.get(item))
                  .filter((row): row is Row<TData> => row !== undefined)

                return (
                  <Fragment key={group.key}>
                    <TableRow className="bg-muted/20 hover:bg-muted/30">
                      <TableCell colSpan={visibleColumnCount} className="p-0">
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
                          onClick={() => setExpandedGroups((previous) => ({
                            ...previous,
                            [group.key]: !(previous[group.key] ?? true),
                          }))}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                              )}
                              <span className="text-sm font-medium">{group.title}</span>
                              {group.countLabel && <Badge variant="secondary">{group.countLabel}</Badge>}
                            </div>
                            {group.subtitle && <p className="pl-6 pt-1 text-xs text-muted-foreground">{group.subtitle}</p>}
                          </div>
                          {group.headerExtras && (
                            <div className="flex items-center gap-2 pl-4" onClick={(event) => event.stopPropagation()}>
                              {group.headerExtras}
                            </div>
                          )}
                        </button>
                      </TableCell>
                    </TableRow>
                    {isExpanded && rows.map(renderDataRow)}
                  </Fragment>
                )
              })
            ) : table.getRowModel().rows.length ? (
              table.getRowModel().rows.map(renderDataRow)
            ) : (
              <TableRow>
                <TableCell colSpan={visibleColumnCount} className="h-24 text-center text-muted-foreground">
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {showGroupedRows ? (
        <div className="flex items-center justify-between gap-4 text-sm">
          <div className="text-muted-foreground">
            {sortedRows.length} row(s)
            {groupedRows.length > 0 && <span>{" "}• {groupedRows.length} group(s)</span>}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-4 text-sm">
          <div className="text-muted-foreground">
            {table.getFilteredSelectedRowModel().rows.length > 0 && (
              <span>{table.getFilteredSelectedRowModel().rows.length} of{" "}</span>
            )}
            {table.getFilteredRowModel().rows.length} row(s)
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={String(table.getState().pagination.pageSize)}
              onValueChange={(v: string) => table.setPageSize(Number(v))}
            >
              <SelectTrigger className="h-8 w-17.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 50, 100].map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-muted-foreground whitespace-nowrap">
              Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export { type ColumnDef, type Table } from "@tanstack/react-table"