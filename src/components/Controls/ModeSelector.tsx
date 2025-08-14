import { useApp } from '../../context/AppContext';
import type { ProcessingMode } from '../../utils/constants';
import { DEBUG_MODE } from '../../utils/debugMode';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Settings } from 'lucide-react';
import * as m from '../../paraglide/messages';

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
          {m.calculation_mode_title()}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Select
          value={state.processing.mode}
          onValueChange={handleChange}
          disabled={state.processing.isLoading}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={m.select_calculation_mode()} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fast">{m.mode_fast()}</SelectItem>
            <SelectItem value="balanced">{m.mode_balanced()}</SelectItem>
            <SelectItem value="accurate">{m.mode_accurate()}</SelectItem>
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground mt-2">
          {m.mode_description()}
        </div>
      </CardContent>
    </Card>
  );
}