import { useState } from 'react';
import { BufferControl } from './BufferControl';
import { ModeSelector } from './ModeSelector';
import { ActionButtons } from './ActionButtons';
import { StatusDisplay } from '../Status/StatusDisplay';
import { Statistics } from '../Status/Statistics';
import { UserInfoSection } from './UserInfoSection';
import { DEBUG_MODE } from '../../utils/debugMode';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { ScrollArea } from '../ui/scroll-area';
import { Separator } from '../ui/separator';
import { Button } from '../ui/button';
import { ChevronDown, ChevronUp } from 'lucide-react';
import * as m from '../../paraglide/messages';

export function ControlPanel() {
  const [isExpanded, setIsExpanded] = useState(true);
  
  if (DEBUG_MODE) {
    return (
      <Card className="absolute top-4 right-4 w-[380px] max-h-[90vh] bg-card/95 backdrop-blur-sm z-[1000]">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-semibold flex items-center justify-between">
            {m.app_title()}
            <span className="text-xs text-muted-foreground font-normal">[Debug Mode]</span>
          </CardTitle>
        </CardHeader>
        
        <CardContent className="space-y-4">
          <ScrollArea className="max-h-[70vh]">
            <Tabs defaultValue="user" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="user">User</TabsTrigger>
                <TabsTrigger value="debug">Debug</TabsTrigger>
              </TabsList>
              
              <TabsContent value="user" className="space-y-4 mt-4">
                <UserInfoSection />
                <ActionButtons />
                <Statistics />
              </TabsContent>
              
              <TabsContent value="debug" className="space-y-4 mt-4">
                <div className="text-sm font-medium text-muted-foreground mb-4">
                  🔧 Debug Controls
                </div>
                <BufferControl />
                <ModeSelector />
                <Separator />
                <Statistics />
              </TabsContent>
            </Tabs>
          </ScrollArea>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`absolute top-4 right-4 ${isExpanded ? 'w-[380px]' : 'w-[280px]'} max-h-[90vh] bg-card/95 backdrop-blur-sm z-[1000] transition-all duration-200`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold flex items-center justify-between">
          Berlin Cannabis Club Map
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-8 w-8 p-0"
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </CardTitle>
      </CardHeader>
      
      {isExpanded && (
        <CardContent className="space-y-4">
          <ScrollArea className="max-h-[70vh]">
            <div className="">
              <UserInfoSection />
              <ActionButtons />
              <Statistics />
              <StatusDisplay />
            </div>
          </ScrollArea>
        </CardContent>
      )}
    </Card>
  );
}