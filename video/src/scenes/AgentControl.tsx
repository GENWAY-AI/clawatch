import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { COLORS, FONTS } from '../styles';
import { FeatureTitle } from '../components/FeatureTitle';
import { Card } from '../components/Card';

const StatusBadge: React.FC<{
  status: 'Running' | 'Paused' | 'Error';
  style?: React.CSSProperties;
}> = ({ status, style = {} }) => {
  const color =
    status === 'Running' ? COLORS.emerald :
    status === 'Paused' ? COLORS.amber :
    COLORS.red;

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 12px',
        borderRadius: 20,
        backgroundColor: `${color}20`,
        ...style,
      }}
    >
      <div style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: color,
        boxShadow: `0 0 6px ${color}`,
      }} />
      <span style={{
        fontFamily: FONTS.sans,
        fontSize: 16,
        color,
        fontWeight: 600,
      }}>
        {status}
      </span>
    </div>
  );
};

const AgentCard: React.FC<{
  name: string;
  model: string;
  status: 'Running' | 'Paused' | 'Error';
  cost: string;
  delay: number;
  highlight?: boolean;
}> = ({ name, model, status, cost, delay, highlight }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Status transition animation for highlighted card
  const isPausing = highlight && frame > 100;
  const displayStatus = isPausing ? 'Paused' : status;

  // Flash effect on status change
  const flashOpacity = highlight
    ? interpolate(frame, [100, 108, 116], [0, 0.3, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : 0;

  return (
    <Card width={940} delay={delay} style={{
      border: highlight ? `1px solid ${COLORS.emerald}40` : `1px solid ${COLORS.cardBorder}`,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Flash overlay */}
      <div style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: COLORS.amber,
        opacity: flashOpacity,
        borderRadius: 16,
      }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 50,
            height: 50,
            borderRadius: 14,
            background: `linear-gradient(135deg, ${COLORS.emerald}30, ${COLORS.emeraldDark}30)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: FONTS.mono,
            fontSize: 20,
            color: COLORS.emerald,
            fontWeight: 700,
          }}>
            {name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontFamily: FONTS.sans, fontSize: 22, fontWeight: 600, color: COLORS.white }}>{name}</div>
            <div style={{ fontFamily: FONTS.mono, fontSize: 15, color: COLORS.gray500 }}>{model}</div>
          </div>
        </div>
        <StatusBadge status={displayStatus} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: FONTS.mono, fontSize: 18, color: COLORS.gray400 }}>
          Cost: <span style={{ color: COLORS.white }}>{cost}</span>
        </div>

        {/* Pause button */}
        {highlight && (
          <div
            style={{
              padding: '8px 20px',
              borderRadius: 8,
              backgroundColor: isPausing ? `${COLORS.amber}20` : `${COLORS.emerald}20`,
              fontFamily: FONTS.sans,
              fontSize: 16,
              fontWeight: 600,
              color: isPausing ? COLORS.amber : COLORS.emerald,
              border: `1px solid ${isPausing ? COLORS.amber : COLORS.emerald}40`,
            }}
          >
            {isPausing ? '▶ Resume' : '⏸ Pause'}
          </div>
        )}
      </div>
    </Card>
  );
};

export const AgentControl: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Cursor animation for "clicking" pause
  const cursorOpacity = interpolate(frame, [70, 78, 105, 110], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const cursorX = interpolate(frame, [78, 95], [700, 520], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const cursorY = interpolate(frame, [78, 95], [500, 680], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  // Click effect
  const clickScale = interpolate(frame, [95, 100, 105], [1, 0.85, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.bg,
        padding: '60px 70px',
        justifyContent: 'center',
      }}
    >
      <FeatureTitle title="Control Agents from Anywhere" />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <AgentCard
          name="code-reviewer"
          model="claude-sonnet-4"
          status="Running"
          cost="$12.40"
          delay={10}
          highlight
        />
        <AgentCard
          name="api-builder"
          model="claude-sonnet-4"
          status="Running"
          cost="$8.15"
          delay={25}
        />
        <AgentCard
          name="test-runner"
          model="claude-haiku-4"
          status="Error"
          cost="$2.30"
          delay={40}
        />
      </div>

      {/* Animated cursor */}
      <div
        style={{
          position: 'absolute',
          left: cursorX,
          top: cursorY,
          opacity: cursorOpacity,
          transform: `scale(${clickScale})`,
          zIndex: 100,
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path
            d="M5 3L19 12L12 13L9 20L5 3Z"
            fill="white"
            stroke={COLORS.gray700}
            strokeWidth={1}
          />
        </svg>
      </div>
    </AbsoluteFill>
  );
};
