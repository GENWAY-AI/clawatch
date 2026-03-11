import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { COLORS, FONTS } from '../styles';
import { FeatureTitle } from '../components/FeatureTitle';

export const ErrorTroubleshooting: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Before card fades out, after card fades in
  const transitionProgress = interpolate(frame, [70, 100], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const beforeOpacity = interpolate(transitionProgress, [0, 0.5], [1, 0], { extrapolateRight: 'clamp' });
  const beforeScale = interpolate(transitionProgress, [0, 0.5], [1, 0.95], { extrapolateRight: 'clamp' });
  const afterOpacity = interpolate(transitionProgress, [0.4, 1], [0, 1], { extrapolateLeft: 'clamp' });
  const afterScale = interpolate(transitionProgress, [0.4, 1], [1.05, 1], { extrapolateLeft: 'clamp' });

  // Before card entrance
  const beforeEnter = spring({
    frame: frame - 10,
    fps,
    config: { damping: 14, stiffness: 100 },
  });

  // Arrow
  const arrowSpring = spring({
    frame: frame - 55,
    fps,
    config: { damping: 14, stiffness: 120 },
  });
  const arrowOpacity = interpolate(arrowSpring, [0, 1], [0, 1]);

  // "Smart" sparkle effect
  const sparkleOpacity = interpolate(frame, [90, 100, 110, 120], [0, 1, 1, 0.7], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const stackTrace = `Error: ECONNREFUSED 127.0.0.1:5432
    at TCPConnectWrap.afterConnect [as oncomplete]
    at Protocol._validateError (node:internal/pg:142)
    at Connection.parseE (node_modules/pg/lib/conn.js:614)
    at Connection.parseMessage (node_modules/pg/lib/conn.js:413)
    at Socket.<anonymous> (node_modules/pg/lib/conn.js:133)
    at Socket.emit (node:events:519:28)
    at addChunk (node:internal/streams:363)`;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.bg,
        padding: '60px 70px',
        justifyContent: 'center',
      }}
    >
      <FeatureTitle title="Smart Error Insights" />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 30, alignItems: 'center' }}>
        {/* Before: Raw log */}
        <div
          style={{
            width: 940,
            opacity: interpolate(beforeEnter, [0, 1], [0, 1]) * (1 - transitionProgress * 0.4),
            transform: `scale(${beforeScale})`,
          }}
        >
          <div style={{
            fontFamily: FONTS.sans,
            fontSize: 18,
            color: COLORS.red,
            marginBottom: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}>
            Before
          </div>
          <div style={{
            backgroundColor: '#0d0d0d',
            border: `1px solid ${COLORS.red}30`,
            borderRadius: 14,
            padding: 24,
            fontFamily: FONTS.mono,
            fontSize: 15,
            lineHeight: '24px',
            color: COLORS.red,
            whiteSpace: 'pre-wrap',
            overflow: 'hidden',
          }}>
            {stackTrace}
          </div>
        </div>

        {/* Arrow */}
        <div style={{ opacity: arrowOpacity, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 50,
            height: 50,
            borderRadius: 25,
            background: `linear-gradient(135deg, ${COLORS.emerald}, ${COLORS.emeraldDark})`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 0 20px ${COLORS.emeraldGlow}`,
            opacity: sparkleOpacity > 0 ? 1 : arrowOpacity,
          }}>
            <span style={{ fontSize: 24, color: COLORS.white }}>↓</span>
          </div>
          <div style={{
            fontFamily: FONTS.sans,
            fontSize: 14,
            color: COLORS.emerald,
            opacity: sparkleOpacity,
          }}>
            AI Analysis
          </div>
        </div>

        {/* After: Clean error card */}
        <div
          style={{
            width: 940,
            opacity: afterOpacity,
            transform: `scale(${afterScale})`,
          }}
        >
          <div style={{
            fontFamily: FONTS.sans,
            fontSize: 18,
            color: COLORS.emerald,
            marginBottom: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}>
            After
          </div>
          <div style={{
            backgroundColor: COLORS.card,
            border: `1px solid ${COLORS.emerald}30`,
            borderRadius: 14,
            padding: 28,
            overflow: 'hidden',
          }}>
            {/* Error type badge */}
            <div style={{
              display: 'inline-flex',
              padding: '4px 12px',
              borderRadius: 8,
              backgroundColor: `${COLORS.red}20`,
              fontFamily: FONTS.sans,
              fontSize: 14,
              color: COLORS.red,
              fontWeight: 600,
              marginBottom: 16,
            }}>
              Connection Error
            </div>

            <div style={{ fontFamily: FONTS.sans, fontSize: 24, fontWeight: 600, color: COLORS.white, marginBottom: 12 }}>
              Database connection refused
            </div>

            <div style={{ fontFamily: FONTS.sans, fontSize: 18, color: COLORS.gray400, lineHeight: '28px', marginBottom: 20 }}>
              PostgreSQL at 127.0.0.1:5432 is not accepting connections. The database server may be down or the connection limit reached.
            </div>

            <div style={{
              padding: '14px 18px',
              backgroundColor: COLORS.bg,
              borderRadius: 10,
              borderLeft: `3px solid ${COLORS.emerald}`,
            }}>
              <div style={{ fontFamily: FONTS.sans, fontSize: 14, color: COLORS.emerald, fontWeight: 600, marginBottom: 6 }}>
                Suggested Fix
              </div>
              <div style={{ fontFamily: FONTS.mono, fontSize: 15, color: COLORS.gray300 }}>
                Check if PostgreSQL is running: <span style={{ color: COLORS.emerald }}>sudo systemctl status postgresql</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
