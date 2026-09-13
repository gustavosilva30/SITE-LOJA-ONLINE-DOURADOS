import { create } from 'zustand'

interface UIState {
    sidebarOpen: boolean
    isImageEditorOpen: boolean
    toggleSidebar: () => void
    setSidebarOpen: (open: boolean) => void
    setImageEditorOpen: (open: boolean) => void
}

export const useUIStore = create<UIState>((set) => ({
    sidebarOpen: true,
    isImageEditorOpen: false,
    toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
    setSidebarOpen: (open) => set({ sidebarOpen: open }),
    setImageEditorOpen: (open) => set({ isImageEditorOpen: open }),
}))
