import { useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { toast } from 'sonner';

export function StatusDisplay() {
  const { state } = useApp();
  const previousStatusRef = useRef<string>('');

  useEffect(() => {
    // Only show toast if status changed and is not empty
    if (state.ui.status && state.ui.status !== previousStatusRef.current) {
      previousStatusRef.current = state.ui.status;
      
      switch (state.ui.statusType) {
        case 'error':
          toast.error(state.ui.status);
          break;
        case 'success':
          toast.success(state.ui.status);
          break;
        default:
          toast(state.ui.status);
          break;
      }
    }
  }, [state.ui.status, state.ui.statusType]);

  // StatusDisplay is now just a toast trigger - no visual component
  return null;
}