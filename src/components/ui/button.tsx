import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';
const buttonVariants = cva('inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4', {
  variants: { variant: { default: 'bg-primary text-primary-foreground hover:bg-primary/90', outline: 'border border-input bg-secondary hover:bg-muted', ghost: 'hover:bg-muted' }, size: { default: 'h-10 px-4 py-2', icon: 'size-10' } }, defaultVariants: { variant: 'default', size: 'default' },
});
export function Button({ className, variant, size, asChild = false, ...props }: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button'; return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
