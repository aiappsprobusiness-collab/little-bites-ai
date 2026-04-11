import * as React from "react";
import * as ToastPrimitives from "@radix-ui/react-toast";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const ToastProvider = ToastPrimitives.Provider;

/** Ниже sticky-хедера (z-40), не перекрывает заголовок; над контентом main. */
const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Viewport
    ref={ref}
    className={cn(
      "fixed left-0 right-0 top-0 z-30 flex max-h-screen w-full flex-col-reverse gap-2 px-4 pb-4 pt-[calc(var(--layout-header-offset)+0.5rem)] sm:bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] sm:left-auto sm:right-0 sm:top-auto sm:max-w-[min(420px,calc(100vw-2rem))] sm:flex-col sm:pt-4",
      className,
    )}
    {...props}
  />
));
ToastViewport.displayName = ToastPrimitives.Viewport.displayName;

const toastVariants = cva(
  [
    "group toast-root pointer-events-auto relative flex w-full max-w-lg items-start gap-3 overflow-hidden rounded-2xl border p-4 shadow-[var(--shadow-soft)] transition-all",
    "data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none",
    "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-3 data-[state=open]:zoom-in-95 data-[state=open]:duration-300",
    "data-[state=closed]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-top-2 data-[state=closed]:duration-200",
    "data-[swipe=end]:animate-out data-[swipe=end]:slide-out-to-right-full",
    "sm:data-[state=open]:slide-in-from-bottom-4 sm:data-[state=closed]:slide-out-to-bottom-2",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "toast-success mx-auto w-full border-primary/25 bg-primary text-primary-foreground sm:ml-auto sm:mr-4",
        destructive:
          "destructive mx-auto w-full border-destructive/40 bg-destructive text-destructive-foreground sm:ml-auto sm:mr-4",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Root> & VariantProps<typeof toastVariants>
>(({ className, variant, ...props }, ref) => {
  return <ToastPrimitives.Root ref={ref} className={cn(toastVariants({ variant }), className)} {...props} />;
});
Toast.displayName = ToastPrimitives.Root.displayName;

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Action
    ref={ref}
    className={cn(
      "inline-flex h-8 shrink-0 items-center justify-center rounded-lg border bg-transparent px-3 text-sm font-medium ring-offset-background transition-colors",
      "hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
      "group-[.toast-success]:border-primary-foreground/35 group-[.toast-success]:bg-primary-foreground/12 group-[.toast-success]:text-primary-foreground hover:group-[.toast-success]:bg-primary-foreground/22",
      "group-[.destructive]:border-destructive-foreground/35 group-[.destructive]:hover:border-destructive-foreground/50 group-[.destructive]:hover:bg-destructive-foreground/15 group-[.destructive]:focus:ring-destructive-foreground/50",
      className,
    )}
    {...props}
  />
));
ToastAction.displayName = ToastPrimitives.Action.displayName;

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Close
    ref={ref}
    className={cn(
      "absolute right-2 top-2 rounded-lg p-1.5 text-primary-foreground/75 opacity-100 transition-colors hover:bg-primary-foreground/15 hover:text-primary-foreground focus:outline-none focus:ring-2 focus:ring-primary-foreground/40",
      "group-[.destructive]:text-destructive-foreground/90 group-[.destructive]:hover:bg-destructive-foreground/15 group-[.destructive]:hover:text-destructive-foreground group-[.destructive]:focus:ring-destructive-foreground/50",
      className,
    )}
    toast-close=""
    {...props}
  >
    <X className="h-4 w-4" strokeWidth={2} />
  </ToastPrimitives.Close>
));
ToastClose.displayName = ToastPrimitives.Close.displayName;

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Title
    ref={ref}
    className={cn(
      "text-typo-body font-semibold leading-snug group-[.toast-success]:font-medium group-[.toast-success]:text-primary-foreground",
      className,
    )}
    {...props}
  />
));
ToastTitle.displayName = ToastPrimitives.Title.displayName;

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitives.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitives.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitives.Description
    ref={ref}
    className={cn(
      "text-typo-subtext opacity-95 group-[.toast-success]:text-primary-foreground/88 group-[.destructive]:text-destructive-foreground/90",
      className,
    )}
    {...props}
  />
));
ToastDescription.displayName = ToastPrimitives.Description.displayName;

type ToastProps = React.ComponentPropsWithoutRef<typeof Toast>;

type ToastActionElement = React.ReactElement<typeof ToastAction>;

export {
  type ToastProps,
  type ToastActionElement,
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
};
