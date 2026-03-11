import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { COLORS, FONTS } from '../styles';
import { FeatureTitle } from '../components/FeatureTitle';

export const CostMonitoring: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // === PHASE 1: Settings Panel (frames 0-90) ===
  const settingsOpacity = interpolate(frame, [0, 10, 80, 95], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const settingsY = interpolate(frame, [80, 95], [0, -40], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Radio toggle entrance
  const radioSpring = spring({ frame: frame - 15, fps, config: { damping: 14, stiffness: 120 } });
  const radioOpacity = interpolate(radioSpring, [0, 1], [0, 1]);
  const radioY = interpolate(radioSpring, [0, 1], [20, 0]);

  // Global limit entrance
  const globalSpring = spring({ frame: frame - 30, fps, config: { damping: 14, stiffness: 120 } });
  const globalOpacity = interpolate(globalSpring, [0, 1], [0, 1]);
  const globalY = interpolate(globalSpring, [0, 1], [20, 0]);

  // Per-agent limits
  const agent1Spring = spring({ frame: frame - 45, fps, config: { damping: 14, stiffness: 120 } });
  const agent1Opacity = interpolate(agent1Spring, [0, 1], [0, 1]);
  const agent1Y = interpolate(agent1Spring, [0, 1], [20, 0]);

  const agent2Spring = spring({ frame: frame - 57, fps, config: { damping: 14, stiffness: 120 } });
  const agent2Opacity = interpolate(agent2Spring, [0, 1], [0, 1]);
  const agent2Y = interpolate(agent2Spring, [0, 1], [20, 0]);

  const agent3Spring = spring({ frame: frame - 69, fps, config: { damping: 14, stiffness: 120 } });
  const agent3Opacity = interpolate(agent3Spring, [0, 1], [0, 1]);
  const agent3Y = interpolate(agent3Spring, [0, 1], [20, 0]);

  // === PHASE 2: Spend Cards (frames 90-160) ===
  const phase2Opacity = interpolate(frame, [88, 100], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const phase2FadeOut = interpolate(frame, [150, 165], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Today spend card
  const todayCardSpring = spring({ frame: frame - 95, fps, config: { damping: 14, stiffness: 100 } });
  const todayCardOpacity = interpolate(todayCardSpring, [0, 1], [0, 1]);
  const todayCardY = interpolate(todayCardSpring, [0, 1], [40, 0]);

  const todaySpend = interpolate(frame, [100, 130], [0, 94.72], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Today progress bar (94.72 / 120 daily = ~79%)
  const todayProgress = interpolate(frame, [105, 140], [0, 0.79], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const todayBarColor =
    todayProgress < 0.5 ? COLORS.emerald :
    todayProgress < 0.7 ? COLORS.amber :
    COLORS.red;

  // MTD spend card
  const mtdCardSpring = spring({ frame: frame - 108, fps, config: { damping: 14, stiffness: 100 } });
  const mtdCardOpacity = interpolate(mtdCardSpring, [0, 1], [0, 1]);
  const mtdCardY = interpolate(mtdCardSpring, [0, 1], [40, 0]);

  const mtdSpend = interpolate(frame, [112, 142], [0, 241.15], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // MTD progress bar (241.15 / 500 = ~48%)
  const mtdProgress = interpolate(frame, [115, 145], [0, 0.48], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const mtdBarColor =
    mtdProgress < 0.4 ? COLORS.emerald :
    mtdProgress < 0.6 ? COLORS.amber :
    COLORS.red;

  // === PHASE 3: Phone Notifications (frames 155-240) ===
  const phase3Opacity = interpolate(frame, [155, 168], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // First notification slide in
  const notif1Spring = spring({ frame: frame - 162, fps, config: { damping: 14, stiffness: 80, mass: 1 } });
  const notif1X = interpolate(notif1Spring, [0, 1], [500, 0]);
  const notif1Opacity = interpolate(notif1Spring, [0, 1], [0, 1]);

  // Second notification slide in
  const notif2Spring = spring({ frame: frame - 192, fps, config: { damping: 14, stiffness: 80, mass: 1 } });
  const notif2X = interpolate(notif2Spring, [0, 1], [500, 0]);
  const notif2Opacity = interpolate(notif2Spring, [0, 1], [0, 1]);

  const radioOptions = ['Daily limit', 'Monthly limit'];
  const selectedRadio = 1; // Monthly

  const agentLimits = [
    { name: 'ofek', limit: '$150', color: COLORS.emerald },
    { name: 'anas', limit: '$120', color: COLORS.blue },
    { name: 'dor', limit: '$80', color: COLORS.purple },
  ];

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.bg,
        padding: '60px 70px',
        justifyContent: 'center',
      }}
    >
      <FeatureTitle title="Cost Monitoring" />

      {/* === PHASE 1: Settings Panel === */}
      <div
        style={{
          position: 'absolute',
          top: 180,
          left: 70,
          right: 70,
          opacity: settingsOpacity,
          transform: `translateY(${settingsY}px)`,
        }}
      >
        <div
          style={{
            backgroundColor: COLORS.card,
            border: `1px solid ${COLORS.cardBorder}`,
            borderRadius: 20,
            padding: 36,
          }}
        >
          {/* Settings header */}
          <div style={{
            fontFamily: FONTS.sans,
            fontSize: 28,
            fontWeight: 700,
            color: COLORS.white,
            marginBottom: 28,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}>
            <span style={{ fontSize: 28 }}>&#9881;</span>
            Cost Limit Settings
          </div>

          {/* Radio toggle */}
          <div style={{
            opacity: radioOpacity,
            transform: `translateY(${radioY}px)`,
            marginBottom: 28,
          }}>
            <div style={{
              fontFamily: FONTS.sans,
              fontSize: 18,
              color: COLORS.gray400,
              marginBottom: 14,
              textTransform: 'uppercase',
              letterSpacing: 1,
            }}>
              Limit Type
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              {radioOptions.map((option, i) => (
                <div
                  key={option}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '12px 24px',
                    borderRadius: 12,
                    backgroundColor: i === selectedRadio ? `${COLORS.emerald}15` : 'transparent',
                    border: `2px solid ${i === selectedRadio ? COLORS.emerald : COLORS.gray700}`,
                  }}
                >
                  <div style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    border: `2px solid ${i === selectedRadio ? COLORS.emerald : COLORS.gray600}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    {i === selectedRadio && (
                      <div style={{
                        width: 12,
                        height: 12,
                        borderRadius: 6,
                        backgroundColor: COLORS.emerald,
                      }} />
                    )}
                  </div>
                  <span style={{
                    fontFamily: FONTS.sans,
                    fontSize: 20,
                    color: i === selectedRadio ? COLORS.white : COLORS.gray500,
                    fontWeight: i === selectedRadio ? 600 : 400,
                  }}>
                    {option}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Global limit */}
          <div style={{
            opacity: globalOpacity,
            transform: `translateY(${globalY}px)`,
            marginBottom: 28,
            padding: '20px 24px',
            backgroundColor: COLORS.bg,
            borderRadius: 14,
            border: `1px solid ${COLORS.cardBorder}`,
          }}>
            <div style={{
              fontFamily: FONTS.sans,
              fontSize: 16,
              color: COLORS.gray500,
              marginBottom: 8,
              textTransform: 'uppercase',
              letterSpacing: 1,
            }}>
              Global Monthly Limit
            </div>
            <div style={{
              fontFamily: FONTS.mono,
              fontSize: 44,
              fontWeight: 700,
              color: COLORS.emerald,
            }}>
              $500<span style={{ fontSize: 22, color: COLORS.gray500 }}>/month</span>
            </div>
          </div>

          {/* Per-agent limits */}
          <div style={{
            fontFamily: FONTS.sans,
            fontSize: 16,
            color: COLORS.gray500,
            marginBottom: 14,
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}>
            Per-Agent Limits
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {agentLimits.map((agent, i) => {
              const opacity = i === 0 ? agent1Opacity : i === 1 ? agent2Opacity : agent3Opacity;
              const y = i === 0 ? agent1Y : i === 1 ? agent2Y : agent3Y;
              return (
                <div
                  key={agent.name}
                  style={{
                    opacity,
                    transform: `translateY(${y}px)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '16px 24px',
                    backgroundColor: COLORS.bg,
                    borderRadius: 12,
                    border: `1px solid ${COLORS.cardBorder}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      backgroundColor: `${agent.color}20`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: FONTS.mono,
                      fontSize: 18,
                      fontWeight: 700,
                      color: agent.color,
                    }}>
                      {agent.name.charAt(0).toUpperCase()}
                    </div>
                    <span style={{
                      fontFamily: FONTS.mono,
                      fontSize: 22,
                      color: COLORS.white,
                      fontWeight: 600,
                    }}>
                      {agent.name}
                    </span>
                  </div>
                  <span style={{
                    fontFamily: FONTS.mono,
                    fontSize: 26,
                    fontWeight: 700,
                    color: agent.color,
                  }}>
                    {agent.limit}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* === PHASE 2: Spend Cards with Progress Bars === */}
      <div
        style={{
          position: 'absolute',
          top: 180,
          left: 70,
          right: 70,
          opacity: phase2Opacity * phase2FadeOut,
          display: 'flex',
          flexDirection: 'column',
          gap: 24,
        }}
      >
        {/* Today's Spend Card */}
        <div
          style={{
            opacity: todayCardOpacity,
            transform: `translateY(${todayCardY}px)`,
            backgroundColor: COLORS.card,
            border: `1px solid ${COLORS.cardBorder}`,
            borderRadius: 20,
            padding: 36,
          }}
        >
          <div style={{
            fontFamily: FONTS.sans,
            fontSize: 18,
            color: COLORS.gray500,
            marginBottom: 8,
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}>
            Today's Spend
          </div>
          <div style={{
            fontFamily: FONTS.mono,
            fontSize: 56,
            fontWeight: 700,
            color: COLORS.white,
            marginBottom: 24,
          }}>
            ${todaySpend.toFixed(2)}
          </div>

          {/* Progress bar */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 10,
          }}>
            <span style={{ fontFamily: FONTS.sans, fontSize: 18, color: COLORS.gray400 }}>
              Daily Budget Usage
            </span>
            <span style={{ fontFamily: FONTS.mono, fontSize: 18, color: todayBarColor }}>
              {Math.round(todayProgress * 100)}%
            </span>
          </div>
          <div style={{
            position: 'relative',
            height: 20,
            backgroundColor: COLORS.gray700,
            borderRadius: 10,
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${todayProgress * 100}%`,
              height: '100%',
              backgroundColor: todayBarColor,
              borderRadius: 10,
              boxShadow: `0 0 16px ${todayBarColor}40`,
            }} />
          </div>
          <div style={{
            fontFamily: FONTS.mono,
            fontSize: 14,
            color: COLORS.gray500,
            marginTop: 8,
            textAlign: 'right',
          }}>
            of $120 daily limit
          </div>
        </div>

        {/* MTD Spend Card */}
        <div
          style={{
            opacity: mtdCardOpacity,
            transform: `translateY(${mtdCardY}px)`,
            backgroundColor: COLORS.card,
            border: `1px solid ${COLORS.cardBorder}`,
            borderRadius: 20,
            padding: 36,
          }}
        >
          <div style={{
            fontFamily: FONTS.sans,
            fontSize: 18,
            color: COLORS.gray500,
            marginBottom: 8,
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}>
            Month to Date
          </div>
          <div style={{
            fontFamily: FONTS.mono,
            fontSize: 56,
            fontWeight: 700,
            color: COLORS.emerald,
            marginBottom: 24,
          }}>
            ${mtdSpend.toFixed(2)}
          </div>

          {/* Progress bar */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginBottom: 10,
          }}>
            <span style={{ fontFamily: FONTS.sans, fontSize: 18, color: COLORS.gray400 }}>
              Monthly Budget Usage
            </span>
            <span style={{ fontFamily: FONTS.mono, fontSize: 18, color: mtdBarColor }}>
              {Math.round(mtdProgress * 100)}%
            </span>
          </div>
          <div style={{
            position: 'relative',
            height: 20,
            backgroundColor: COLORS.gray700,
            borderRadius: 10,
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${mtdProgress * 100}%`,
              height: '100%',
              backgroundColor: mtdBarColor,
              borderRadius: 10,
              boxShadow: `0 0 16px ${mtdBarColor}40`,
            }} />
          </div>
          <div style={{
            fontFamily: FONTS.mono,
            fontSize: 14,
            color: COLORS.gray500,
            marginTop: 8,
            textAlign: 'right',
          }}>
            of $500 monthly limit
          </div>
        </div>
      </div>

      {/* === PHASE 3: Phone Notifications === */}
      <div
        style={{
          position: 'absolute',
          top: 180,
          left: 70,
          right: 70,
          opacity: phase3Opacity,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 20,
        }}
      >
        {/* Phone frame */}
        <div style={{
          width: 580,
          borderRadius: 44,
          border: `3px solid ${COLORS.gray700}`,
          backgroundColor: '#000',
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Dynamic Island */}
          <div style={{
            width: 140,
            height: 32,
            borderRadius: 16,
            backgroundColor: COLORS.gray800,
            alignSelf: 'center',
            marginBottom: 30,
          }} />

          {/* Status bar time */}
          <div style={{
            fontFamily: FONTS.sans,
            fontSize: 18,
            fontWeight: 600,
            color: COLORS.white,
            textAlign: 'center',
            marginBottom: 30,
          }}>
            9:41
          </div>

          {/* First notification */}
          <div
            style={{
              opacity: notif1Opacity,
              transform: `translateX(${notif1X}px)`,
              backgroundColor: COLORS.card,
              borderRadius: 20,
              padding: 22,
              marginBottom: 16,
              border: `1px solid ${COLORS.cardBorder}`,
              boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{
                width: 28,
                height: 28,
                borderRadius: 7,
                background: `linear-gradient(135deg, ${COLORS.emerald}, ${COLORS.emeraldDark})`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13,
                color: COLORS.white,
                fontWeight: 900,
                fontFamily: FONTS.sans,
              }}>C</div>
              <span style={{ fontFamily: FONTS.sans, fontSize: 16, color: COLORS.gray400, fontWeight: 600 }}>
                ClaWatch Alert
              </span>
              <span style={{ fontFamily: FONTS.sans, fontSize: 14, color: COLORS.gray600, marginLeft: 'auto' }}>
                now
              </span>
            </div>
            <div style={{
              fontFamily: FONTS.sans,
              fontSize: 20,
              color: COLORS.white,
              fontWeight: 600,
              marginBottom: 6,
            }}>
              Agent Limit Exceeded
            </div>
            <div style={{
              fontFamily: FONTS.sans,
              fontSize: 17,
              color: COLORS.gray400,
              lineHeight: '24px',
            }}>
              Agent <span style={{ color: COLORS.amber, fontWeight: 600 }}>ofek</span> exceeded monthly limit (<span style={{ color: COLORS.red }}>$162</span>/<span style={{ color: COLORS.emerald }}>$150</span>)
            </div>
          </div>

          {/* Second notification */}
          <div
            style={{
              opacity: notif2Opacity,
              transform: `translateX(${notif2X}px)`,
              backgroundColor: COLORS.card,
              borderRadius: 20,
              padding: 22,
              border: `1px solid ${COLORS.red}30`,
              boxShadow: `0 4px 24px rgba(0,0,0,0.4), 0 0 20px ${COLORS.red}15`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{
                width: 28,
                height: 28,
                borderRadius: 7,
                background: `linear-gradient(135deg, ${COLORS.emerald}, ${COLORS.emeraldDark})`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13,
                color: COLORS.white,
                fontWeight: 900,
                fontFamily: FONTS.sans,
              }}>C</div>
              <span style={{ fontFamily: FONTS.sans, fontSize: 16, color: COLORS.gray400, fontWeight: 600 }}>
                ClaWatch Alert
              </span>
              <span style={{ fontFamily: FONTS.sans, fontSize: 14, color: COLORS.gray600, marginLeft: 'auto' }}>
                now
              </span>
            </div>
            <div style={{
              fontFamily: FONTS.sans,
              fontSize: 20,
              color: COLORS.red,
              fontWeight: 600,
              marginBottom: 6,
            }}>
              Critical: Budget Warning
            </div>
            <div style={{
              fontFamily: FONTS.sans,
              fontSize: 17,
              color: COLORS.gray400,
              lineHeight: '24px',
            }}>
              MTD spend reached <span style={{ color: COLORS.red, fontWeight: 600 }}>80%</span> of <span style={{ color: COLORS.emerald }}>$500</span> monthly limit
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
