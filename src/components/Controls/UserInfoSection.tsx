import { useApp } from '../../context/AppContext';
import { Badge } from '../ui/badge';
import { Separator } from '../ui/separator';
import { School, MapPin, Users, Target } from 'lucide-react';

export function UserInfoSection() {
  const { state } = useApp();
  
  return (
    <div className="space-y-6">
      {/* Safety Requirements */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 font-medium text-foreground">
          <Target className="w-4 h-4 text-blue-600" />
          Safety Requirements
        </div>
        <div className="pl-6 flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Required Distance:</span>
          <Badge variant="secondary" className="font-medium">
            {state.processing.bufferDistance}m from restricted areas
          </Badge>
        </div>
      </div>

      <Separator className="my-4" />

      {/* Restricted Locations */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 font-medium text-foreground">
          <MapPin className="w-4 h-4 text-red-600" />
          Where Cannabis Clubs Cannot Be Located
        </div>
        <div className="pl-6 space-y-3">
          <div className="text-sm text-muted-foreground">
            Cannabis clubs must keep a safe distance from:
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2">
              <School className="w-3 h-3 text-blue-500" />
              <span>Schools</span>
            </div>
            <div className="flex items-center gap-2">
              <Target className="w-3 h-3 text-green-500" />
              <span>Playgrounds</span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="w-3 h-3 text-purple-500" />
              <span>Community Centers</span>
            </div>
            <div className="flex items-center gap-2">
              <Target className="w-3 h-3 text-orange-500" />
              <span>Sports Centers</span>
            </div>
          </div>
        </div>
      </div>

      <Separator className="my-4" />

      {/* Instructions */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 font-medium text-foreground">
          <MapPin className="w-4 h-4 text-green-600" />
          How to Find Suitable Locations
        </div>
        <div className="pl-6 space-y-2 text-sm">
          <div className="flex items-start gap-2">
            <span className="font-medium text-muted-foreground">1.</span>
            <span>Zoom in close to your area of interest</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-medium text-muted-foreground">2.</span>
            <span>Suitable locations will automatically appear</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-muted-foreground">3.</span>
            <Badge variant="default" className="bg-green-500 text-white">Green areas</Badge>
            <span className="text-xs">are where clubs can be located</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium text-muted-foreground">4.</span>
            <Badge variant="destructive">Red areas</Badge>
            <span className="text-xs">are too close to restricted locations</span>
          </div>
        </div>
      </div>
    </div>
  );
}