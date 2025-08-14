import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Badge } from '../ui/badge';
import { School, MapPin, Users, Target, ChevronDown } from 'lucide-react';

export function UserInfoSection() {
  const { state } = useApp();
  const [safetyExpanded, setSafetyExpanded] = useState(true);
  const [restrictedExpanded, setRestrictedExpanded] = useState(false);
  const [instructionsExpanded, setInstructionsExpanded] = useState(false);
  
  return (
    <div className="space-y-3">
      {/* Safety Requirements */}
      <div>
        <button
          onClick={() => setSafetyExpanded(!safetyExpanded)}
          className="w-full flex items-center justify-between hover:bg-muted/50 rounded-md p-1.5 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-medium text-foreground">Safety Requirements</span>
          </div>
          <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform duration-200 ${safetyExpanded ? 'rotate-180' : ''}`} />
        </button>
        
        {safetyExpanded && (
          <div className="pl-6 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Required Distance:</span>
              <Badge variant="secondary" className="text-xs">
                {state.processing.bufferDistance}m from restricted areas
              </Badge>
            </div>
          </div>
        )}
      </div>

      {/* Restricted Locations */}
      <div>
        <button
          onClick={() => setRestrictedExpanded(!restrictedExpanded)}
          className="w-full flex items-center justify-between hover:bg-muted/50 rounded-md p-1.5 transition-colors"
        >
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-red-600" />
            <span className="text-sm font-medium text-foreground">Restricted Areas</span>
          </div>
          <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform duration-200 ${restrictedExpanded ? 'rotate-180' : ''}`} />
        </button>
        
        {restrictedExpanded && (
          <div className="pl-6 pt-2 space-y-2">
            <p className="text-xs text-muted-foreground">
              Cannabis clubs must keep a safe distance from:
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              <div className="flex items-center gap-1.5 text-xs">
                <School className="w-3 h-3 text-blue-600" />
                <span>Schools</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <Target className="w-3 h-3 text-green-600" />
                <span>Playgrounds</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <Users className="w-3 h-3 text-purple-600" />
                <span>Community Centers</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <Target className="w-3 h-3 text-orange-600" />
                <span>Sports Centers</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div>
        <button
          onClick={() => setInstructionsExpanded(!instructionsExpanded)}
          className="w-full flex items-center justify-between hover:bg-muted/50 rounded-md p-1.5 transition-colors"
        >
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-green-600" />
            <span className="text-sm font-medium text-foreground">How to Use</span>
          </div>
          <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform duration-200 ${instructionsExpanded ? 'rotate-180' : ''}`} />
        </button>
        
        {instructionsExpanded && (
          <div className="pl-6 pt-2 space-y-1.5">
            <div className="flex items-start gap-2">
              <span className="text-xs text-muted-foreground font-medium">1.</span>
              <span className="text-xs">Zoom in close to your area of interest</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-xs text-muted-foreground font-medium">2.</span>
              <span className="text-xs">Suitable locations will automatically appear</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-xs text-muted-foreground font-medium">3.</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge variant="default" className="bg-green-500 hover:bg-green-500 text-white text-xs">Green</Badge>
                <span className="text-xs">= safe for clubs</span>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-xs text-muted-foreground font-medium">4.</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge variant="destructive" className="text-xs">Red</Badge>
                <span className="text-xs">= too close to restricted areas</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}