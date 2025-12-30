import { useTheme } from "next-themes"
import { Toaster as Sonner, ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast: "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg group-[.toaster]:backdrop-blur-sm",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          error: "group-[.toaster]:!bg-destructive/10 group-[.toaster]:!border-destructive/40 group-[.toaster]:!text-destructive",
          success: "group-[.toaster]:!bg-primary/10 group-[.toaster]:!border-primary/40 group-[.toaster]:!text-primary",
          warning: "group-[.toaster]:!bg-amber-500/10 group-[.toaster]:!border-amber-500/40 group-[.toaster]:!text-amber-500",
          info: "group-[.toaster]:!bg-blue-500/10 group-[.toaster]:!border-blue-500/40 group-[.toaster]:!text-blue-500",
        },
        style: {
          background: "var(--background)",
          color: "var(--foreground)",
          border: "1px solid var(--border)",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
