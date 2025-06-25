"use client"

// Inspired by react-hot-toast library
import * as React from "react"
import { v4 as uuidv4 } from "uuid"
import type {
  ToastActionElement,
  ToastProps,
} from "@/components/ui/toast"

// === 設定の外部化 ===
const TOAST_CONFIG = {
  LIMIT: 1,
  DELAYS: {
    DEFAULT: 5000,
    SUCCESS: 3000,
    ERROR: 8000,
    INFO: 5000,
    LOADING: 0,
  }
} as const;

// === 型安全性の向上 ===
export type ToastType = 'default' | 'success' | 'error' | 'info' | 'loading';

export type ToasterToast = ToastProps & {
  readonly id: string
  title?: React.ReactNode
  description?: React.ReactNode
  action?: ToastActionElement
  type?: ToastType
  duration?: number
  open: boolean
  onOpenChange?: (open: boolean) => void
}

const ActionType = {
  ADD_TOAST: "ADD_TOAST",
  UPDATE_TOAST: "UPDATE_TOAST",
  DISMISS_TOAST: "DISMISS_TOAST",
  REMOVE_TOAST: "REMOVE_TOAST",
} as const;

type Action =
  | { type: typeof ActionType.ADD_TOAST; toast: ToasterToast }
  | { type: typeof ActionType.UPDATE_TOAST; toast: Partial<ToasterToast> & { id: string } }
  | { type: typeof ActionType.DISMISS_TOAST; toastId?: string }
  | { type: typeof ActionType.REMOVE_TOAST; toastId?: string }

interface ToastState {
  toasts: readonly ToasterToast[]
}

class ToastTimeoutManager {
  private timeouts = new Map<string, ReturnType<typeof setTimeout>>();

  addTimeout(toastId: string, delay: number, callback: () => void): void {
    if (this.timeouts.has(toastId)) return;
    const timeout = setTimeout(() => {
      this.timeouts.delete(toastId);
      callback();
    }, delay);
    this.timeouts.set(toastId, timeout);
  }

  clearTimeout(toastId: string): void {
    const timeout = this.timeouts.get(toastId);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(toastId);
    }
  }

  clearAllTimeouts(): void {
    this.timeouts.forEach(clearTimeout);
    this.timeouts.clear();
  }
}

const timeoutManager = new ToastTimeoutManager();
const listeners: Array<(state: ToastState) => void> = [];
let memoryState: ToastState = { toasts: [] };

class IdGenerator {
  generate(): string {
    return uuidv4();
  }
}

const idGenerator = new IdGenerator();

function getToastDuration(toast: Partial<ToasterToast>): number {
  if (toast.duration !== undefined) return toast.duration;
  switch (toast.type) {
    case 'success': return TOAST_CONFIG.DELAYS.SUCCESS;
    case 'error': return TOAST_CONFIG.DELAYS.ERROR;
    case 'info': return TOAST_CONFIG.DELAYS.INFO;
    case 'loading': return TOAST_CONFIG.DELAYS.LOADING;
    case 'default':
    default: return TOAST_CONFIG.DELAYS.DEFAULT;
  }
}

function addToRemoveQueue(toastId: string, duration: number): void {
  if (duration === 0) return;
  timeoutManager.addTimeout(toastId, duration, () => {
    dispatch({ type: ActionType.REMOVE_TOAST, toastId });
  });
}

export function toastReducer(state: ToastState, action: Action): ToastState {
  switch (action.type) {
    case ActionType.ADD_TOAST: {
      if (!action.toast.id) {
        console.warn("Toast without ID attempted to be added");
        return state;
      }
      const newToasts = [action.toast, ...state.toasts];
      if (newToasts.length > TOAST_CONFIG.LIMIT) {
        const lastToast = newToasts[newToasts.length - 1];
        timeoutManager.clearTimeout(lastToast.id);
        newToasts.pop();
      }
      return { ...state, toasts: newToasts };
    }

    case ActionType.UPDATE_TOAST: {
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        ),
      };
    }

    case ActionType.DISMISS_TOAST: {
      const { toastId } = action;
      const toastsToRemove = toastId ? state.toasts.filter(t => t.id === toastId) : state.toasts;
      toastsToRemove.forEach((toast) => {
        const duration = getToastDuration(toast);
        addToRemoveQueue(toast.id, duration);
      });
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined ? { ...t, open: false } : t
        ),
      };
    }

    case ActionType.REMOVE_TOAST: {
      if (action.toastId === undefined) {
        timeoutManager.clearAllTimeouts();
        return { ...state, toasts: [] };
      }
      timeoutManager.clearTimeout(action.toastId);
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      };
    }

    default: {
      const exhaustiveCheck: never = action;
      return state;
    }
  }
}

function dispatch(action: Action): void {
  try {
    memoryState = toastReducer(memoryState, action);
    listeners.forEach((listener) => {
      try {
        listener(memoryState);
      } catch (err) {
        console.error("Toast listener error:", err);
      }
    });
  } catch (err) {
    console.error("Toast dispatch error:", {
      action: action.type,
      error: err,
      currentState: memoryState.toasts.length
});  }
}

type CreateToastParams = Omit<ToasterToast, "id"> & {
  type?: ToastType;
  duration?: number;
};

function createToast(params: CreateToastParams) {
  const id = idGenerator.generate();
  const update = (updateParams: Partial<ToasterToast>) => dispatch({ type: ActionType.UPDATE_TOAST, toast: { ...updateParams, id } });
  const dismiss = () => dispatch({ type: ActionType.DISMISS_TOAST, toastId: id });

  const toast: ToasterToast = {
    ...params,
    id,
    open: true,
    onOpenChange: (open) => {
      if (!open) dismiss();
    },
  };

  dispatch({ type: ActionType.ADD_TOAST, toast });

  return { id, dismiss, update };
}

export function useToast() {
  const [state, setState] = React.useState<ToastState>(memoryState);
  React.useEffect(() => {
    const unsubscribe = (state: ToastState) => setState(state);
    listeners.push(unsubscribe);
    return () => {
      const index = listeners.indexOf(unsubscribe);
      if (index > -1) listeners.splice(index, 1);
    };  
  }, []);

  return {
    ...state,
    toast: createToast,
    dismiss: (toastId?: string) => dispatch({ type: ActionType.DISMISS_TOAST, toastId }),
  };
}

export const toast = createToast;
export const toastSuccess = (params: Omit<CreateToastParams, 'type'>) => createToast({ ...params, type: 'success' });
export const toastError = (params: Omit<CreateToastParams, 'type'>) => createToast({ ...params, type: 'error' });
export const toastInfo = (params: Omit<CreateToastParams, 'type'>) => createToast({ ...params, type: 'info' });
export const toastLoading = (params: Omit<CreateToastParams, 'type'>) => createToast({ ...params, type: 'loading' });
