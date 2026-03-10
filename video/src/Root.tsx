import React from 'react';
import { Composition } from 'remotion';
import { ClaWatchShowcase } from './ClaWatchShowcase';
import { TOTAL_DURATION } from './styles';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="ClaWatchShowcase"
        component={ClaWatchShowcase}
        durationInFrames={TOTAL_DURATION}
        fps={30}
        width={1080}
        height={1920}
      />
    </>
  );
};
