import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { materialsApi, productsApi } from '../api';

export type UndoActionType =
  | 'bulk_approve'
  | 'bulk_reject'
  | 'bulk_delete'
  | 'single_approve'
  | 'single_reject';

export interface UndoPreviousState {
  id: number;
  approvalStatus?: string;
  approvedPrice?: number | null;
  currentSellingPrice?: number | null;
  isActive?: boolean;
}

export interface UndoSnapshot {
  actionType: UndoActionType;
  description: string;
  affectedIds: number[];
  previousStates: UndoPreviousState[];
  deleteEntity?: 'materials' | 'products';
  onDataRefresh?: () => void | Promise<void>;
}

interface UndoActionContextValue {
  undoState: UndoSnapshot | null;
  registerUndo: (snapshot: UndoSnapshot) => void;
  executeUndo: () => Promise<void>;
  dismissUndo: () => void;
  isUndoing: boolean;
  feedback: { message: string; type: 'success' | 'error' } | null;
  clearFeedback: () => void;
}

const UndoActionContext = createContext<UndoActionContextValue | null>(null);

export function UndoActionProvider({ children }: { children: ReactNode }) {
  const [undoState, setUndoState] = useState<UndoSnapshot | null>(null);
  const [isUndoing, setIsUndoing] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const registerUndo = useCallback((snapshot: UndoSnapshot) => {
    setUndoState(snapshot);
  }, []);

  const dismissUndo = useCallback(() => {
    setUndoState(null);
  }, []);

  const clearFeedback = useCallback(() => {
    setFeedback(null);
  }, []);

  const executeUndo = useCallback(async () => {
    if (!undoState || isUndoing) return;

    setIsUndoing(true);
    try {
      if (undoState.actionType === 'bulk_delete') {
        if (undoState.deleteEntity === 'products') {
          await Promise.all(
            undoState.previousStates.map((item) =>
              productsApi.update(item.id, {
                isActive: true,
              })
            )
          );
        } else {
          await Promise.all(
            undoState.previousStates.map((item) =>
              materialsApi.update(item.id, {
                isActive: true,
              })
            )
          );
        }
      } else {
        await Promise.all(
          undoState.previousStates.map((item) =>
            productsApi.update(item.id, {
              approvalStatus: item.approvalStatus,
              approvedPrice: item.approvedPrice,
              currentSellingPrice: item.currentSellingPrice,
              rejectionReason: null,
            })
          )
        );
      }

      if (undoState.onDataRefresh) {
        await undoState.onDataRefresh();
      }

      setUndoState(null);
      setFeedback({ message: 'Action undone successfully.', type: 'success' });
    } catch (error) {
      console.error('Undo failed:', error);
      setFeedback({ message: 'Could not undo. Please refresh and try again.', type: 'error' });
    } finally {
      setIsUndoing(false);
    }
  }, [isUndoing, undoState]);

  const value = useMemo<UndoActionContextValue>(() => ({
    undoState,
    registerUndo,
    executeUndo,
    dismissUndo,
    isUndoing,
    feedback,
    clearFeedback,
  }), [undoState, registerUndo, executeUndo, dismissUndo, isUndoing, feedback, clearFeedback]);

  return (
    <UndoActionContext.Provider value={value}>
      {children}
    </UndoActionContext.Provider>
  );
}

export default function useUndoAction() {
  const context = useContext(UndoActionContext);
  if (!context) {
    throw new Error('useUndoAction must be used within UndoActionProvider');
  }

  return {
    undoState: context.undoState,
    registerUndo: context.registerUndo,
    executeUndo: context.executeUndo,
    dismissUndo: context.dismissUndo,
    isUndoing: context.isUndoing,
    feedback: context.feedback,
    clearFeedback: context.clearFeedback,
  };
}