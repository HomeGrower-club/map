import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { School, Shield, CheckCircle } from 'lucide-react';

export function FloatingLegend() {
  return (
    <Card className="absolute bottom-4 right-4 w-[200px] bg-card/95 backdrop-blur-sm z-[1000]">
      <CardHeader>
        <CardTitle>Map Legend</CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 bg-red-500/40 border border-red-500/60 rounded-sm flex-shrink-0" />
          <div className="flex items-center gap-2 flex-1">
            <Shield className="w-3 h-3 text-red-600" />
            <span className="text-xs">Restricted Areas</span>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 bg-green-500/40 border border-green-500/60 rounded-sm flex-shrink-0" />
          <div className="flex items-center gap-2 flex-1">
            <CheckCircle className="w-3 h-3 text-green-600" />
            <span className="text-xs">Eligible Areas</span>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 bg-blue-500 rounded-full flex-shrink-0" />
          <div className="flex items-center gap-2 flex-1">
            <School className="w-3 h-3 text-blue-600" />
            <span className="text-xs">Sensitive Locations</span>
          </div>
        </div>
        
        {/* <div className="pt-2 border-t border-border">
          <div className="text-xs text-muted-foreground">
            <Badge variant="outline" className="text-xs">
              Green: Safe for clubs
            </Badge>
          </div>
        </div> */}
      </CardContent>
    </Card>
  );
}