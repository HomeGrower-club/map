import { useApp } from '../../context/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Slider } from '../ui/slider';
import { Badge } from '../ui/badge';
import { Ruler } from 'lucide-react';

export function BufferControl() {
  const { state, dispatch } = useApp();

  const handleChange = (values: number[]) => {
    const value = values[0];
    if (value >= 50 && value <= 500) {
      dispatch({ type: 'SET_BUFFER_DISTANCE', payload: value });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Ruler className="w-4 h-4" />
            Buffer Distance
          </div>
          <Badge variant="secondary">
            {state.processing.bufferDistance}m
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Slider
            value={[state.processing.bufferDistance]}
            onValueChange={handleChange}
            min={50}
            max={500}
            step={50}
            disabled={state.processing.isLoading}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>50m</span>
            <span>500m</span>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          Minimum distance from schools, playgrounds, and community centers
        </div>
      </CardContent>
    </Card>
  );
}