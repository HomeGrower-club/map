import { useState } from 'react';
import { Info } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import * as m from '@/paraglide/messages.js';

export function LegalDisclaimer() {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-4 left-4 z-[1010] pointer-events-none">
      <div className="pointer-events-auto">
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger asChild>
          <Button 
            variant="outline" 
            size="sm"
            className="bg-background/90 backdrop-blur-sm border-muted-foreground/20 hover:bg-background/95 text-xs"
          >
            <Info className="w-3 h-3 mr-1" />
            {m.disclaimer_title()}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Info className="w-5 h-5 text-amber-500" />
              {m.disclaimer_title()}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-left text-sm leading-relaxed space-y-3">
              <p className="font-medium text-foreground">
                {m.disclaimer_text()}
              </p>
              <div className="text-xs text-muted-foreground space-y-2 pt-2 border-t border-border">
                <p>
                  <strong>{m.disclaimer_important_label()}</strong> {m.disclaimer_spatial_info()}
                </p>
                <p>
                  {m.disclaimer_regulation_info()}
                </p>
                <p>
                  {m.disclaimer_accuracy_info()}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setOpen(false)}>
              {m.disclaimer_understand_button()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </div>
  );
}