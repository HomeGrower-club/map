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
                  <strong>Important:</strong> This visualization tool is provided for informational purposes only. 
                  The spatial calculations and buffer zones shown are approximate and based on available OpenStreetMap data.
                </p>
                <p>
                  Actual cannabis club regulations may include additional requirements not reflected in this tool, 
                  such as zoning restrictions, licensing requirements, local ordinances, and other legal considerations.
                </p>
                <p>
                  Data accuracy and completeness cannot be guaranteed. Users should independently verify all 
                  information and consult with qualified legal professionals before making any business or legal decisions.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setOpen(false)}>
              I Understand
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </div>
  );
}