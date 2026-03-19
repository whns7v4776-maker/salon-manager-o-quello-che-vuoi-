import { SALON_MODULES, SalonModuleKey } from '@/src/lib/salon-modules';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SalonNameDisplayStyle, SalonNameFontVariant } from '../src/lib/platform';
import { AppWordmark } from './app-wordmark';
import { HeroSalonName } from './hero-salon-name';

type ModuleHeroHeaderProps = {
  moduleKey: SalonModuleKey;
  title: string;
  salonName: string;
  salonNameDisplayStyle?: SalonNameDisplayStyle;
  salonNameFontVariant?: SalonNameFontVariant;
  iconOffsetY?: number;
  rightAccessory?: React.ReactNode;
  onTitleLongPress?: () => void;
  subtitle?: string;
};

export function ModuleHeroHeader({
  moduleKey,
  title,
  salonName,
  salonNameDisplayStyle = 'corsivo',
  salonNameFontVariant = 'neon',
  iconOffsetY = 0,
  rightAccessory,
  onTitleLongPress,
  subtitle,
}: ModuleHeroHeaderProps) {
  const moduleConfig = SALON_MODULES[moduleKey];

  return (
    <View style={styles.wrap}>
      <View style={styles.brandBand}>
        <AppWordmark />
      </View>

      <View style={styles.titleBand}>
        <View
          style={[
            styles.iconBadgeWrap,
            {
              shadowColor: moduleConfig.accent.text,
              borderColor: moduleConfig.accent.border,
            },
          ]}
        >
          <Ionicons
            name={moduleConfig.icon.active}
            size={25}
            color="#6f4d1f"
            style={[styles.iconBadgeIcon, { transform: [{ translateY: iconOffsetY }] }]}
          />
        </View>

        <Text style={styles.title} onLongPress={onTitleLongPress}>
          {title}
        </Text>

        {rightAccessory ? <View style={styles.rightAccessory}>{rightAccessory}</View> : null}
      </View>

      <View style={styles.signatureLine} />

      <HeroSalonName
        salonName={salonName}
        displayStyle={salonNameDisplayStyle}
        fontVariant={salonNameFontVariant}
      />
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    width: '100%',
    overflow: 'visible',
  },
  brandBand: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 0,
    paddingHorizontal: 12,
    overflow: 'visible',
  },
  titleBand: {
    width: '100%',
    minHeight: 52,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 50,
    position: 'relative',
  },
  iconBadgeWrap: {
    position: 'absolute',
    left: 8,
    top: '50%',
    marginTop: -19,
    zIndex: 2,
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: '#f2e5cf',
    borderColor: 'rgba(146, 102, 44, 0.74)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6f4d1f',
    shadowOpacity: 0.16,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    opacity: 1,
  },
  iconBadgeIcon: {
    opacity: 0.98,
  },
  rightAccessory: {
    position: 'absolute',
    right: 8,
    top: '50%',
    marginTop: -19,
    zIndex: 2,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0f172a',
    letterSpacing: -0.28,
    textAlign: 'center',
    marginBottom: 0,
  },
  signatureLine: {
    width: '34%',
    minWidth: 122,
    maxWidth: 194,
    height: 3,
    borderRadius: 999,
    marginTop: 5,
    marginBottom: 10,
    backgroundColor: '#9d7234',
  },
  subtitle: {
    maxWidth: 360,
    marginTop: 10,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
    color: '#64748b',
    textAlign: 'center',
  },
});
