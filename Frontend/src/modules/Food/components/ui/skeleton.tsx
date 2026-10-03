import { cn } from "@food/utils/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      data-slot="skeleton"
      className={cn(
        "rounded-[calc(var(--radius)-2px)] bg-gray-200/80 animate-pulse dark:bg-gray-800/80 shadow-sm",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
