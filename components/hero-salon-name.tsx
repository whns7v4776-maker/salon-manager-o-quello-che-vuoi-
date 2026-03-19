import { StyleSheet, Text, View } from 'react-native';
import { resolveSalonNameFontFamily } from '../src/lib/fonts';
import { SalonNameDisplayStyle, SalonNameFontVariant } from '../src/lib/platform';

type HeroSalonNameProps = {
  salonName: string;
  displayStyle?: SalonNameDisplayStyle;
  fontVariant?: SalonNameFontVariant;
};

export function HeroSalonName({
  salonName,
  displayStyle = 'corsivo',
  fontVariant = 'neon',
}: HeroSalonNameProps) {
  const baseName = salonName !== 'Il tuo salone' ? salonName : 'Il tuo salone';
  const displayName =
    displayStyle === 'stampatello'
      ? baseName.toLocaleUpperCase('it-IT')
      : displayStyle === 'minuscolo'
        ? baseName.toLocaleLowerCase('it-IT')
        : baseName;

  return (
    <View style={styles.wrap}>
      <View style={styles.screenBrandChip}>
        <View style={styles.baseFill} />
        <View style={styles.softSheenTop} />
        <View style={styles.softSheenBottom} />
        <View style={styles.frameOuter} />
        <View style={styles.frameInner} />
        <Text
          style={[
            styles.screenBrandChipText,
            { fontFamily: resolveSalonNameFontFamily(displayStyle, fontVariant) },
            displayStyle === 'corsivo'
              ? styles.screenBrandCorsivo
              : displayStyle === 'minuscolo'
                ? styles.screenBrandMinuscolo
                : styles.screenBrandStampatello,
          ]}
        >
          {displayName}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    marginTop: 0,
    marginBottom: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenBrandChip: {
    width: '91%',
    minHeight: 34,
    alignItems: 'center',
    alignSelf: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#f8f0e1',
    borderWidth: 1,
    borderColor: 'rgba(146, 102, 44, 0.56)',
    shadowColor: '#7f5826',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    overflow: 'hidden',
  },
  baseFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#f1e3ca',
  },
  softSheenTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '48%',
    backgroundColor: 'rgba(255,255,255,0.26)',
  },
  softSheenBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '48%',
    backgroundColor: 'rgba(146, 102, 44, 0.18)',
  },
  frameOuter: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 3,
    right: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(146, 102, 44, 0.64)',
  },
  frameInner: {
    position: 'absolute',
    top: 6,
    bottom: 6,
    left: 8,
    right: 8,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
  },
  screenBrandChipText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2f1f0e',
    textAlign: 'center',
    textTransform: 'uppercase',
    textShadowColor: 'rgba(95, 62, 24, 0.22)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 1.2,
  },
  screenBrandCorsivo: {
    fontStyle: 'normal',
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  screenBrandStampatello: {
    fontStyle: 'normal',
    fontWeight: '700',
    letterSpacing: 2.2,
  },
  screenBrandMinuscolo: {
    fontStyle: 'normal',
    fontWeight: '700',
    letterSpacing: 1.2,
  },
});
