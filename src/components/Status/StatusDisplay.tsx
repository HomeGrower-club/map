import { useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { toast } from 'sonner';
import * as m from '../../paraglide/messages';

export function StatusDisplay() {
  const { state } = useApp();
  const loadingToastRef = useRef<string | number | null>(null);

  useEffect(() => {
    if (state.processing.isLoading) {
      // Show loading toast if not already showing
      if (!loadingToastRef.current) {
        loadingToastRef.current = toast.loading(m.calculating_locations(), {
          duration: Infinity, // Keep until manually dismissed
        });
      }
    } else {
      // Dismiss loading toast when done
      if (loadingToastRef.current) {
        toast.dismiss(loadingToastRef.current);
        loadingToastRef.current = null;
      }
    }
  }, [state.processing.isLoading]);

  return null;
}