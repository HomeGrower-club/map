import { useApp } from '../../context/AppContext';
import type { ProcessingMode } from '../../utils/constants';
import { DEBUG_MODE } from '../../utils/debugMode';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Settings } from 'lucide-react';

export function ModeSelector() {
  const { state, dispatch } = useApp();

  const handleChange = (value: string) => {
    dispatch({ 
      type: 'SET_PROCESSING_MODE', 
      payload: value as ProcessingMode 
    });
  };

  // Only show in debug mode
  if (!DEBUG_MODE) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Settings className="w-4 h-4" />
          Calculation Mode
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Select
          value={state.processing.mode}
          onValueChange={handleChange}
          disabled={state.processing.isLoading}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select calculation mode" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fast">Fast (Less Accurate)</SelectItem>
            <SelectItem value="balanced">Balanced</SelectItem>
            <SelectItem value="accurate">Accurate (Slower)</SelectItem>
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground mt-2">
          Controls the precision vs. speed trade-off for zone calculations
        </div>
      </CardContent>
    </Card>
  );
}