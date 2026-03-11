import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { COLORS, INTRO_DURATION, COST_MONITORING_DURATION, SCENE_DURATION, OUTRO_DURATION } from './styles';
import { Intro } from './scenes/Intro';
import { CostMonitoring } from './scenes/CostMonitoring';
import { SmartAlerts } from './scenes/SmartAlerts';
import { AgentControl } from './scenes/AgentControl';
import { UnifiedSessions } from './scenes/UnifiedSessions';
import { ErrorTroubleshooting } from './scenes/ErrorTroubleshooting';
import { MultiProfile } from './scenes/MultiProfile';
import { Outro } from './scenes/Outro';

export const ClaWatchShowcase: React.FC = () => {
  let offset = 0;

  const scenes = [
    { Component: Intro, duration: INTRO_DURATION },
    { Component: CostMonitoring, duration: COST_MONITORING_DURATION },
    { Component: SmartAlerts, duration: SCENE_DURATION },
    { Component: AgentControl, duration: SCENE_DURATION },
    { Component: UnifiedSessions, duration: SCENE_DURATION },
    { Component: ErrorTroubleshooting, duration: SCENE_DURATION },
    { Component: MultiProfile, duration: SCENE_DURATION },
    { Component: Outro, duration: OUTRO_DURATION },
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg }}>
      {scenes.map(({ Component, duration }, i) => {
        const from = offset;
        offset += duration;
        return (
          <Sequence key={i} from={from} durationInFrames={duration}>
            <Component />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
