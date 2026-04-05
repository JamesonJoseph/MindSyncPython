import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

type SkeletonBlockProps = {
  width?: ViewStyle['width'];
  height: number;
  borderRadius?: number;
  style?: ViewStyle;
};

export function SkeletonBlock({
  width = '100%',
  height,
  borderRadius = 12,
  style,
}: SkeletonBlockProps) {
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.9,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.45,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.block,
        {
          width,
          height,
          borderRadius,
          opacity,
        },
        style,
      ]}
    />
  );
}

type CardListSkeletonProps = {
  count?: number;
  cardHeight?: number;
  style?: ViewStyle;
};

export function CardListSkeleton({
  count = 4,
  cardHeight = 124,
  style,
}: CardListSkeletonProps) {
  const items = useMemo(() => Array.from({ length: count }, (_, index) => index), [count]);

  return (
    <View style={style}>
      {items.map((item) => (
        <View key={item} style={[styles.card, { minHeight: cardHeight }]}>
          <SkeletonBlock width="38%" height={12} borderRadius={6} />
          <SkeletonBlock width="56%" height={24} borderRadius={8} style={styles.spaceMd} />
          <SkeletonBlock width="100%" height={14} borderRadius={7} />
          <SkeletonBlock width="84%" height={14} borderRadius={7} style={styles.spaceSm} />
          <SkeletonBlock width="48%" height={42} borderRadius={12} style={styles.spaceLg} />
        </View>
      ))}
    </View>
  );
}

export function CalendarScreenSkeleton() {
  return (
    <View>
      <View style={styles.calendarHeader}>
        <SkeletonBlock width={42} height={42} borderRadius={21} />
        <View style={styles.calendarTitle}>
          <SkeletonBlock width={96} height={20} borderRadius={8} />
          <SkeletonBlock width={54} height={14} borderRadius={7} style={styles.spaceSm} />
        </View>
        <SkeletonBlock width={42} height={42} borderRadius={21} />
      </View>

      <View style={styles.calendarCard}>
        <SkeletonBlock width="100%" height={220} borderRadius={20} />
      </View>

      <View style={styles.spaceLg}>
        <SkeletonBlock width={140} height={28} borderRadius={10} />
      </View>

      <CardListSkeleton count={2} cardHeight={96} />
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: '#E8EEEE',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 18,
    marginBottom: 16,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 18,
  },
  calendarTitle: {
    alignItems: 'center',
  },
  calendarCard: {
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    padding: 18,
    marginBottom: 20,
  },
  spaceSm: {
    marginTop: 8,
  },
  spaceMd: {
    marginTop: 12,
  },
  spaceLg: {
    marginTop: 18,
  },
});
