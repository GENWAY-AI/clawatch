import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { COLORS, FONTS } from '../styles';
import { FeatureTitle } from '../components/FeatureTitle';

const AlertCard: React.FC<{
  icon: string;
  text: string;
  time: string;
  severity: 'warning' | 'critical';
  delay: number;
}> = ({ icon, text, time, severity, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const enter = spring({
    frame: frame - delay,
    fps,
    config: { damping: 14, stiffness: 120, mass: 0.7 },
  });

  const translateX = interpolate(enter, [0, 1], [300, 0]);
  const opacity = interpolate(enter, [0, 1], [0, 1]);

  const borderColor = severity === 'critical' ? COLORS.red : COLORS.amber;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '18px 24px',
        backgroundColor: COLORS.card,
        borderRadius: 14,
        borderLeft: `4px solid ${borderColor}`,
        opacity,
        transform: `translateX(${translateX}px)`,
        width: 940,
      }}
    >
      <span style={{ fontSize: 32 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: FONTS.sans, fontSize: 22, color: COLORS.white, fontWeight: 600 }}>{text}</div>
        <div style={{ fontFamily: FONTS.sans, fontSize: 16, color: COLORS.gray500, marginTop: 4 }}>{time}</div>
      </div>
    </div>
  );
};

export const SmartAlerts: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Phone mockup slide in
  const phoneSpring = spring({
    frame: frame - 10,
    fps,
    config: { damping: 15, stiffness: 80, mass: 1 },
  });
  const phoneX = interpolate(phoneSpring, [0, 1], [-400, 0]);
  const phoneOpacity = interpolate(phoneSpring, [0, 1], [0, 1]);

  // Integration icons
  const iconsSpring = spring({
    frame: frame - 100,
    fps,
    config: { damping: 12, stiffness: 100 },
  });
  const iconsOpacity = interpolate(iconsSpring, [0, 1], [0, 1]);
  const iconsY = interpolate(iconsSpring, [0, 1], [30, 0]);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.bg,
        padding: '60px 70px',
        justifyContent: 'center',
      }}
    >
      <FeatureTitle title="Smart Alerts to Your Phone" />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 40 }}>
        {/* Phone mockup */}
        <div
          style={{
            opacity: phoneOpacity,
            transform: `translateX(${phoneX}px)`,
          }}
        >
          <div
            style={{
              width: 360,
              height: 640,
              borderRadius: 40,
              border: `3px solid ${COLORS.gray700}`,
              backgroundColor: '#000',
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Phone notch */}
            <div style={{
              width: 120,
              height: 28,
              borderRadius: 14,
              backgroundColor: COLORS.gray800,
              alignSelf: 'center',
              marginBottom: 20,
            }} />

            {/* Notification */}
            <div style={{
              backgroundColor: COLORS.card,
              borderRadius: 16,
              padding: 16,
              marginBottom: 12,
              border: `1px solid ${COLORS.cardBorder}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{
                  width: 20, height: 20, borderRadius: 5,
                  background: `linear-gradient(135deg, ${COLORS.emerald}, ${COLORS.emeraldDark})`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, color: COLORS.white, fontWeight: 900, fontFamily: FONTS.sans,
                }}>C</div>
                <span style={{ fontFamily: FONTS.sans, fontSize: 12, color: COLORS.gray400, fontWeight: 600 }}>ClaWatch</span>
                <span style={{ fontFamily: FONTS.sans, fontSize: 11, color: COLORS.gray600, marginLeft: 'auto' }}>now</span>
              </div>
              <div style={{ fontFamily: FONTS.sans, fontSize: 16, color: COLORS.white, fontWeight: 600 }}>
                Cost Alert Triggered
              </div>
              <div style={{ fontFamily: FONTS.sans, fontSize: 14, color: COLORS.gray400, marginTop: 4 }}>
                Agent &quot;code-reviewer&quot; exceeded $45 in the last hour. Daily limit: $120.
              </div>
            </div>

            {/* Second notification */}
            <div style={{
              backgroundColor: COLORS.card,
              borderRadius: 16,
              padding: 16,
              border: `1px solid ${COLORS.cardBorder}`,
              opacity: interpolate(frame, [60, 75], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{
                  width: 20, height: 20, borderRadius: 5,
                  background: `linear-gradient(135deg, ${COLORS.emerald}, ${COLORS.emeraldDark})`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, color: COLORS.white, fontWeight: 900, fontFamily: FONTS.sans,
                }}>C</div>
                <span style={{ fontFamily: FONTS.sans, fontSize: 12, color: COLORS.gray400, fontWeight: 600 }}>ClaWatch</span>
                <span style={{ fontFamily: FONTS.sans, fontSize: 11, color: COLORS.gray600, marginLeft: 'auto' }}>2m ago</span>
              </div>
              <div style={{ fontFamily: FONTS.sans, fontSize: 16, color: COLORS.white, fontWeight: 600 }}>
                Agent Stuck Detected
              </div>
              <div style={{ fontFamily: FONTS.sans, fontSize: 14, color: COLORS.gray400, marginTop: 4 }}>
                Agent &quot;api-builder&quot; has been idle for 15 minutes with no output.
              </div>
            </div>
          </div>
        </div>

        {/* Alert cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <AlertCard
            icon="⚠️"
            text="Agent stuck for 15 min"
            time="api-builder · 2 min ago"
            severity="warning"
            delay={35}
          />
          <AlertCard
            icon="🔴"
            text="Cost spike: $45 in 1 hour"
            time="code-reviewer · just now"
            severity="critical"
            delay={55}
          />
          <AlertCard
            icon="⚠️"
            text="Token usage 80% of daily limit"
            time="data-analyst · 5 min ago"
            severity="warning"
            delay={75}
          />

          {/* Integration icons */}
          <div
            style={{
              display: 'flex',
              gap: 20,
              marginTop: 20,
              opacity: iconsOpacity,
              transform: `translateY(${iconsY}px)`,
              alignItems: 'center',
              justifyContent: 'center',
              flexWrap: 'wrap' as const,
            }}
          >
            <span style={{ fontFamily: FONTS.sans, fontSize: 18, color: COLORS.gray500 }}>Integrates with:</span>
            {['Telegram', 'Slack', 'Email'].map((name, i) => (
              <div
                key={name}
                style={{
                  padding: '8px 18px',
                  borderRadius: 10,
                  backgroundColor: COLORS.card,
                  border: `1px solid ${COLORS.cardBorder}`,
                  fontFamily: FONTS.sans,
                  fontSize: 18,
                  color: COLORS.gray300,
                  fontWeight: 500,
                }}
              >
                {name}
              </div>
            ))}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
