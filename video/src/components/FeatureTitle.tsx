import React from 'react';
import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { COLORS, FONTS } from '../styles';

export const FeatureTitle: React.FC<{
  title: string;
  delay?: number;
}> = ({ title, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = spring({
    frame: frame - delay,
    fps,
    config: { damping: 14, stiffness: 100, mass: 0.8 },
  });

  const opacity = interpolate(enter, [0, 1], [0, 1]);
  const translateX = interpolate(enter, [0, 1], [-60, 0]);

  const lineWidth = interpolate(enter, [0, 1], [0, 60]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        opacity,
        transform: `translateX(${translateX}px)`,
        marginBottom: 40,
      }}
    >
      <div
        style={{
          width: lineWidth,
          height: 4,
          backgroundColor: COLORS.emerald,
          borderRadius: 2,
          boxShadow: `0 0 12px ${COLORS.emeraldGlow}`,
        }}
      />
      <h2
        style={{
          fontFamily: FONTS.sans,
          fontSize: 52,
          fontWeight: 700,
          color: COLORS.white,
          margin: 0,
          letterSpacing: -1,
        }}
      >
        {title}
      </h2>
    </div>
  );
};
