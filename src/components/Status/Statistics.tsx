import { useApp } from '../../context/AppContext';
import { DEBUG_MODE } from '../../utils/debugMode';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { BarChart, Clock, Database } from 'lucide-react';

export function Statistics() {
  const { state } = useApp();

  // Only show statistics in debug mode
  if (!DEBUG_MODE || !state.ui.stats) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <BarChart className="w-4 h-4" />
          Statistics
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <Database className="w-3 h-3 text-muted-foreground" />
            <span>Features processed:</span>
          </div>
          <Badge variant="secondary">
            {state.ui.stats.features}
          </Badge>
        </div>
        
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <Clock className="w-3 h-3 text-muted-foreground" />
            <span>Processing time:</span>
          </div>
          <Badge variant="outline">
            {state.ui.stats.time}ms
          </Badge>
        </div>
        
        <div className="flex items-center justify-between text-sm">
          <span>Mode:</span>
          <Badge variant="default">
            {state.ui.stats.mode}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}