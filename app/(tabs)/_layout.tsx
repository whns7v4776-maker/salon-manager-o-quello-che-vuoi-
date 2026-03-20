import { Ionicons } from '@expo/vector-icons';
import {
    createMaterialTopTabNavigator,
    MaterialTopTabBarProps,
    MaterialTopTabNavigationEventMap,
    MaterialTopTabNavigationOptions,
} from '@react-navigation/material-top-tabs';
import { ParamListBase, TabNavigationState } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { withLayoutContext } from 'expo-router';
import React from 'react';
import {
    Animated,
    GestureResponderEvent,
    LayoutChangeEvent,
    PanResponder,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';
import { useAppContext } from '../../src/context/AppContext';
import { tApp } from '../../src/lib/i18n';
import { SALON_MODULES, SalonModuleKey } from '../../src/lib/salon-modules';

const MaterialTopTabs = createMaterialTopTabNavigator();

const ExpoRouterMaterialTopTabs = withLayoutContext<
  MaterialTopTabNavigationOptions,
  typeof MaterialTopTabs.Navigator,
  TabNavigationState<ParamListBase>,
  MaterialTopTabNavigationEventMap
>(MaterialTopTabs.Navigator);

const IS_ANDROID = Platform.OS === 'android';
const TAB_BAR_OUTER_BOTTOM = IS_ANDROID ? 28 : 16;

function BottomTabBar({
  state,
  descriptors,
  navigation,
  richiesteInAttesa,
  clientiNonLetti,
}: MaterialTopTabBarProps & { richiesteInAttesa: number; clientiNonLetti: number }) {
  const { appLanguage } = useAppContext();
  const { width: viewportWidth } = useWindowDimensions();
  const tabTitles = React.useMemo(
    () => ({
      index: tApp(appLanguage, 'tab_home'),
      agenda: tApp(appLanguage, 'tab_agenda'),
      prenotazioni: tApp(appLanguage, 'tab_requests'),
      clienti: tApp(appLanguage, 'tab_clients'),
      cassa: tApp(appLanguage, 'tab_cash'),
      servizi: tApp(appLanguage, 'tab_services'),
    }),
    [appLanguage]
  );
  const tabBarRef = React.useRef<View | null>(null);
  const [tabBarWidth, setTabBarWidth] = React.useState(0);
  const [tabBarPageX, setTabBarPageX] = React.useState(0);
  const [tabItemLayouts, setTabItemLayouts] = React.useState<
    Record<string, { x: number; width: number }>
  >({});
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const tabCount = state.routes.length || 1;
  const tabBarHorizontalPadding = viewportWidth <= 360 ? 12 : viewportWidth <= 390 ? 14 : 16;
  const availableBarWidth = Math.min(
    Math.max(viewportWidth - tabBarHorizontalPadding * 2, 0),
    420
  );
  const theoreticalItemWidth = availableBarWidth > 0 ? availableBarWidth / tabCount : 0;
  const isUltraCompact = theoreticalItemWidth > 0 && theoreticalItemWidth < 56;
  const isCompact = theoreticalItemWidth > 0 && theoreticalItemWidth < 64;
  const tabBarHeight = isUltraCompact
    ? IS_ANDROID
      ? 72
      : 68
    : isCompact
      ? IS_ANDROID
        ? 78
        : 72
      : IS_ANDROID
        ? 82
        : 74;
  const tabBarVerticalPadding = isUltraCompact ? 8 : isCompact ? 9 : IS_ANDROID ? 12 : 10;
  const tabIconSize = isUltraCompact ? 18 : isCompact ? 20 : 22;
  const tabLabelFontSize = isUltraCompact ? 9 : isCompact ? 10 : 11;
  const tabLabelMinScale = isUltraCompact ? 0.78 : 0.84;
  const tabItemHorizontalMargin = isUltraCompact ? 1 : isCompact ? 2 : 4;
  const tabItemVerticalPadding = isUltraCompact ? 2 : 4;
  const itemWidth = tabBarWidth > 0 ? tabBarWidth / tabCount : 0;
  const activeIndicatorInset = isUltraCompact ? 2 : isCompact ? 4 : 8;
  const activeIndicatorWidth = itemWidth > 0 ? Math.max(40, itemWidth - activeIndicatorInset) : 0;
  const visualIndex = dragIndex ?? state.index;
  const lastTriggeredIndexRef = React.useRef<number | null>(null);
  const skipNextHapticIndexRef = React.useRef<number | null>(null);
  const previousIndexRef = React.useRef(state.index);
  const indicatorProgress = React.useRef(new Animated.Value(state.index)).current;

  const triggerImmediateHaptic = React.useCallback(() => {
    if (process.env.EXPO_OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
    }
  }, []);

  const handleTabBarLayout = (event: LayoutChangeEvent) => {
    setTabBarWidth(event.nativeEvent.layout.width);

    requestAnimationFrame(() => {
      tabBarRef.current?.measureInWindow((x) => {
        setTabBarPageX(x);
      });
    });
  };

  const getProgressFromTouch = React.useCallback(
    (pageX: number) => {
      if (itemWidth <= 0) return null;

      const locationX = pageX - tabBarPageX;
      const clampedX = Math.max(0, Math.min(tabBarWidth - 0.001, locationX));
      const centeredProgress = clampedX / itemWidth - 0.5;

      return Math.max(0, Math.min(tabCount - 1, centeredProgress));
    },
    [itemWidth, tabBarPageX, tabBarWidth, tabCount]
  );

  const getIndexFromTouch = React.useCallback(
    (pageX: number) => {
      const rawProgress = getProgressFromTouch(pageX);
      if (rawProgress === null) return null;
      return Math.round(rawProgress);
    },
    [getProgressFromTouch]
  );

  React.useEffect(() => {
    if (previousIndexRef.current === state.index) return;

    if (skipNextHapticIndexRef.current === state.index) {
      skipNextHapticIndexRef.current = null;
      previousIndexRef.current = state.index;
      return;
    }

    previousIndexRef.current = state.index;
  }, [state.index]);

  React.useEffect(() => {
    if (isDragging) return;

    Animated.spring(indicatorProgress, {
      toValue: visualIndex,
      useNativeDriver: true,
      damping: 13,
      stiffness: 420,
      mass: 0.52,
    }).start();
  }, [indicatorProgress, isDragging, visualIndex]);

  const navigateToIndex = React.useCallback(
    (index: number, triggerHaptic: boolean, skipStateHaptic = false) => {
      const route = state.routes[index];
      if (!route) return;

      if (triggerHaptic) {
        Haptics.selectionAsync().catch(() => null);
      }

      if (skipStateHaptic) {
        skipNextHapticIndexRef.current = index;
      }

      if (state.index !== index) {
        navigation.navigate(route.name);
      }
    },
    [navigation, state.index, state.routes]
  );

  const handleTabBarTouchAt = React.useCallback(
    (event: GestureResponderEvent) => {
      const nextProgress = getProgressFromTouch(event.nativeEvent.pageX);
      const nextIndex = getIndexFromTouch(event.nativeEvent.pageX);
      if (nextIndex === null || nextProgress === null) return;

      setIsDragging(true);
      setDragIndex(nextIndex);
      indicatorProgress.setValue(nextProgress);

      if (lastTriggeredIndexRef.current === nextIndex) return;

      lastTriggeredIndexRef.current = nextIndex;
    },
    [getIndexFromTouch, getProgressFromTouch, indicatorProgress]
  );

  const clearDragState = React.useCallback(
    (event?: GestureResponderEvent) => {
      const releaseIndex =
        event && itemWidth > 0 ? getIndexFromTouch(event.nativeEvent.pageX) : dragIndex;

      if (releaseIndex !== null && releaseIndex !== undefined) {
        triggerImmediateHaptic();
        setDragIndex(releaseIndex);
        indicatorProgress.setValue(releaseIndex);
        navigateToIndex(releaseIndex, false, true);
      }

      setIsDragging(false);
      setDragIndex(null);
      lastTriggeredIndexRef.current = null;
    },
    [
      dragIndex,
      getIndexFromTouch,
      indicatorProgress,
      itemWidth,
      navigateToIndex,
      triggerImmediateHaptic,
    ]
  );

  const panResponder = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => itemWidth > 0,
        onStartShouldSetPanResponderCapture: () => itemWidth > 0,
        onMoveShouldSetPanResponder: (_event, gestureState) =>
          Math.abs(gestureState.dx) > 4 && Math.abs(gestureState.dx) >= Math.abs(gestureState.dy),
        onMoveShouldSetPanResponderCapture: (_event, gestureState) =>
          Math.abs(gestureState.dx) > 4 && Math.abs(gestureState.dx) >= Math.abs(gestureState.dy),
        onPanResponderGrant: (event) => {
          tabBarRef.current?.measureInWindow((x) => {
            setTabBarPageX(x);
          });
          handleTabBarTouchAt(event);
        },
        onPanResponderMove: (event) => {
          handleTabBarTouchAt(event);
        },
        onPanResponderRelease: clearDragState,
        onPanResponderTerminate: clearDragState,
        onPanResponderTerminationRequest: () => true,
      }),
    [clearDragState, handleTabBarTouchAt, itemWidth]
  );

  const indicatorTranslateX =
    itemWidth > 0
      ? indicatorProgress.interpolate({
          inputRange: state.routes.map((_, index) => index),
          outputRange: state.routes.map((route, index) => {
            const layout = tabItemLayouts[route.key];
            const routeOffset = route.name === 'clienti' ? -1 : 0;
            if (layout) {
              return layout.x + (layout.width - activeIndicatorWidth) / 2 - 2 + routeOffset;
            }

            return index * itemWidth + (itemWidth - activeIndicatorWidth) / 2 - 2 + routeOffset;
          }),
          extrapolate: 'clamp',
        })
      : 0;

  return (
    <View pointerEvents="box-none" style={styles.tabBarOverlay}>
      <View style={[styles.tabBarOuter, { paddingHorizontal: tabBarHorizontalPadding }]}>
        <View
          ref={tabBarRef}
          style={[
            styles.tabBar,
            {
              height: tabBarHeight,
              paddingTop: tabBarVerticalPadding,
              paddingBottom: tabBarVerticalPadding,
            },
          ]}
          onLayout={handleTabBarLayout}
          {...panResponder.panHandlers}
        >
          <View pointerEvents="none" style={styles.glassHighlightBottom} />
          {itemWidth > 0 ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.activeIndicator,
                {
                  width: activeIndicatorWidth,
                  transform: [{ translateX: indicatorTranslateX }],
                },
              ]}
            />
          ) : null}
          {state.routes.map((route, index) => {
            const isFocused = visualIndex === index;
            const routeKey = route.name as SalonModuleKey;
            const config = SALON_MODULES[routeKey];

            if (!config) return null;

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });

              if (!isFocused && !event.defaultPrevented) {
                const routeIndex = state.routes.findIndex((item) => item.key === route.key);
                navigateToIndex(routeIndex, false, true);
              }
            };

            const onLongPress = () => {
              navigation.emit({
                type: 'tabLongPress',
                target: route.key,
              });
            };

            const label =
              descriptors[route.key]?.options.title ??
              descriptors[route.key]?.options.tabBarLabel ??
              tabTitles[routeKey];

            return (
              <TouchableOpacity
                key={route.key}
                accessibilityRole="button"
                accessibilityState={isFocused ? { selected: true } : {}}
                onLayout={(event) => {
                  const { x, width } = event.nativeEvent.layout;
                  setTabItemLayouts((current) => {
                    const previous = current[route.key];
                    if (previous && previous.x === x && previous.width === width) {
                      return current;
                    }

                    return {
                      ...current,
                      [route.key]: { x, width },
                    };
                  });
                }}
                onPress={onPress}
                onPressIn={() => {
                  if (!isFocused) {
                    triggerImmediateHaptic();
                  }
                }}
                onLongPress={onLongPress}
                activeOpacity={0.9}
                style={[
                  styles.tabBarItem,
                  {
                    marginHorizontal: tabItemHorizontalMargin,
                    paddingVertical: tabItemVerticalPadding,
                  },
                ]}
              >
                <Ionicons
                  name={isFocused ? config.icon.active : config.icon.inactive}
                  size={tabIconSize}
                  color={isFocused ? '#111111' : '#5b6472'}
                />
                {route.name === 'prenotazioni' && richiesteInAttesa > 0 ? (
                  <View style={styles.notificationBadge}>
                    <Text style={styles.notificationBadgeText}>
                      {richiesteInAttesa > 99 ? '99+' : richiesteInAttesa}
                    </Text>
                  </View>
                ) : null}
                {route.name === 'clienti' && clientiNonLetti > 0 ? (
                  <View style={styles.notificationBadge}>
                    <Text style={styles.notificationBadgeText}>
                      {clientiNonLetti > 99 ? '99+' : clientiNonLetti}
                    </Text>
                  </View>
                ) : null}
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={tabLabelMinScale}
                  style={[
                    styles.tabBarLabel,
                    { fontSize: tabLabelFontSize },
                    isFocused ? styles.tabBarLabelActive : styles.tabBarLabelInactive,
                  ]}
                >
                  {typeof label === 'string' ? label : tabTitles[routeKey]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
}

export default function TabLayout() {
  const { richiestePrenotazione, clienti, appLanguage } = useAppContext();
  const richiesteInAttesa = richiestePrenotazione.filter(
    (item) =>
      item.stato === 'In attesa' || (item.stato === 'Annullata' && item.viewedBySalon === false)
  ).length;
  const clientiNonLetti = clienti.filter(
    (item) => item.fonte === 'frontend' && item.viewedBySalon === false
  ).length;

  return (
    <ExpoRouterMaterialTopTabs
      tabBar={(props) => (
        <BottomTabBar
          {...props}
          richiesteInAttesa={richiesteInAttesa}
          clientiNonLetti={clientiNonLetti}
        />
      )}
      screenOptions={{
        swipeEnabled: true,
        animationEnabled: true,
        lazy: false,
        lazyPreloadDistance: 1,
        tabBarScrollEnabled: false,
        tabBarStyle: {
          display: 'none',
        },
        sceneStyle: {
          backgroundColor: 'transparent',
        },
      }}
    >
      <ExpoRouterMaterialTopTabs.Screen
        name="index"
        options={{ title: tApp(appLanguage, 'tab_home') }}
      />
      <ExpoRouterMaterialTopTabs.Screen
        name="agenda"
        options={{ title: tApp(appLanguage, 'tab_agenda') }}
      />
      <ExpoRouterMaterialTopTabs.Screen
        name="prenotazioni"
        options={{ title: tApp(appLanguage, 'tab_requests') }}
      />
      <ExpoRouterMaterialTopTabs.Screen
        name="clienti"
        options={{ title: tApp(appLanguage, 'tab_clients') }}
      />
      <ExpoRouterMaterialTopTabs.Screen
        name="cassa"
        options={{ title: tApp(appLanguage, 'tab_cash') }}
      />
      <ExpoRouterMaterialTopTabs.Screen
        name="servizi"
        options={{ title: tApp(appLanguage, 'tab_services') }}
      />
    </ExpoRouterMaterialTopTabs>
  );
}

const styles = StyleSheet.create({
  tabBarOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 20,
    elevation: 20,
    backgroundColor: 'transparent',
  },
  tabBarOuter: {
    width: '100%',
    paddingBottom: TAB_BAR_OUTER_BOTTOM,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  tabBar: {
    flexDirection: 'row',
    width: '100%',
    maxWidth: 420,
    backgroundColor: 'rgba(214, 228, 248, 0.9)',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.82)',
    shadowColor: '#7c93b6',
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 14,
    overflow: 'hidden',
  },
  glassHighlightBottom: {
    position: 'absolute',
    bottom: 8,
    left: 28,
    right: 28,
    height: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  tabBarItem: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    zIndex: 2,
  },
  activeIndicator: {
    position: 'absolute',
    top: 6,
    bottom: 6,
    left: 0,
    backgroundColor: 'rgba(183, 210, 244, 0.42)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(149, 184, 229, 0.7)',
    shadowColor: '#7c93b6',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 1 },
  },
  notificationBadge: {
    position: 'absolute',
    top: 1,
    right: 8,
    minWidth: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: '#ff3b30',
    borderWidth: 2,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    shadowColor: '#ff3b30',
    shadowOpacity: 0.22,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  notificationBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  tabBarLabel: {
    fontWeight: '700',
    marginTop: 3,
    textAlign: 'center',
    width: '100%',
  },
  tabBarLabelActive: {
    color: '#111111',
  },
  tabBarLabelInactive: {
    color: '#5b6472',
  },
});
