import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-lg bg-neutral-200/60",
        className
      )}
      {...props}
    />
  )
}

function SkeletonText({ lines = 1, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn("h-3.5", i === lines - 1 && lines > 1 ? "w-3/4" : "w-full")}
        />
      ))}
    </div>
  )
}

function SkeletonCircle({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "h-8 w-8", md: "h-10 w-10", lg: "h-12 w-12" }
  return <Skeleton className={cn("rounded-full", sizes[size], className)} />
}

function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-xl border border-neutral-200/60 bg-white p-4 space-y-3", className)}>
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  )
}

// Conversation list skeleton
function SkeletonConversation() {
  return (
    <div className="flex items-start gap-3 px-3 py-3 border-b">
      <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="flex justify-between">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3 w-14" />
        </div>
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-full" />
      </div>
    </div>
  )
}

function SkeletonConversationList() {
  return (
    <div>
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonConversation key={i} />
      ))}
    </div>
  )
}

// Chat messages skeleton
function SkeletonMessage({ align = "left" }: { align?: "left" | "right" }) {
  return (
    <div className={cn("flex gap-2 mb-3", align === "right" && "justify-end")}>
      <div className={cn("space-y-1.5", align === "right" ? "items-end" : "items-start")}>
        <Skeleton
          className={cn(
            "rounded-2xl",
            align === "right"
              ? "h-10 w-48 bg-neutral-300/40"
              : "h-10 w-56"
          )}
        />
        <Skeleton className="h-2.5 w-12" />
      </div>
    </div>
  )
}

function SkeletonChat() {
  return (
    <div className="p-4 space-y-1">
      <SkeletonMessage align="left" />
      <SkeletonMessage align="right" />
      <SkeletonMessage align="left" />
      <SkeletonMessage align="right" />
      <SkeletonMessage align="left" />
    </div>
  )
}

// Table skeleton
function SkeletonTableRow({ cols = 5 }: { cols?: number }) {
  return (
    <tr className="border-b">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="p-3">
          <Skeleton className={cn("h-4", i === 0 ? "w-32" : "w-20")} />
        </td>
      ))}
    </tr>
  )
}

function SkeletonTable({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="rounded-xl border border-neutral-200/60 bg-white overflow-hidden">
      <div className="border-b bg-neutral-50/80 p-3 flex gap-6">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3.5 w-16" />
        ))}
      </div>
      <table className="w-full">
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <SkeletonTableRow key={i} cols={cols} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

// KPI card skeleton
function SkeletonKpi() {
  return (
    <div className="rounded-xl border border-neutral-200/60 bg-white p-4 space-y-2">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3.5 w-20" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>
      <Skeleton className="h-7 w-16" />
      <Skeleton className="h-3 w-24" />
    </div>
  )
}

function SkeletonKpiGrid() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <SkeletonKpi key={i} />
      ))}
    </div>
  )
}

// Kanban skeleton
function SkeletonKanbanCard() {
  return (
    <div className="rounded-xl border border-neutral-200/60 bg-white p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Skeleton className="h-7 w-7 rounded-lg" />
        <Skeleton className="h-3.5 w-24" />
      </div>
      <Skeleton className="h-5 w-16" />
      <Skeleton className="h-3 w-20" />
    </div>
  )
}

function SkeletonKanban() {
  return (
    <div className="flex gap-4 overflow-hidden">
      {Array.from({ length: 5 }).map((_, col) => (
        <div key={col} className="w-64 shrink-0 space-y-3">
          <Skeleton className="h-5 w-20" />
          {Array.from({ length: 3 - col % 2 }).map((_, row) => (
            <SkeletonKanbanCard key={row} />
          ))}
        </div>
      ))}
    </div>
  )
}

// Contact panel skeleton
function SkeletonContactPanel() {
  return (
    <div className="p-5 space-y-5">
      <div className="flex flex-col items-center gap-3">
        <Skeleton className="h-16 w-16 rounded-xl" />
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-4 w-20" />
      </div>
      <Skeleton className="h-px w-full" />
      <div className="space-y-3">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-16 rounded-xl" />
      </div>
      <div className="flex gap-1.5 flex-wrap">
        <Skeleton className="h-5 w-12 rounded-md" />
        <Skeleton className="h-5 w-16 rounded-md" />
        <Skeleton className="h-5 w-14 rounded-md" />
      </div>
    </div>
  )
}

export {
  Skeleton,
  SkeletonText,
  SkeletonCircle,
  SkeletonCard,
  SkeletonConversationList,
  SkeletonChat,
  SkeletonTable,
  SkeletonKpiGrid,
  SkeletonKanban,
  SkeletonContactPanel,
}
