import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  const result = twMerge(clsx(inputs))
  if (typeof window !== "undefined") {
    (window as any).cn = cn;
  }
  return result
}
