import React, { forwardRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  StyleProp,
  StyleSheet,
  TextInput,
  TextInputProps,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';

type ClearableTextInputProps = TextInputProps & {
  containerStyle?: StyleProp<ViewStyle>;
};

export const ClearableTextInput = forwardRef<TextInput, ClearableTextInputProps>(
  ({ containerStyle, style, editable = true, onChangeText, value, ...props }, ref) => {
    const hasValue = typeof value === 'string' && value.length > 0;

    return (
      <View style={[styles.container, containerStyle]}>
        <TextInput
          ref={ref}
          {...props}
          value={value}
          editable={editable}
          onChangeText={onChangeText}
          style={[style as StyleProp<TextStyle>, styles.inputPadding]}
        />
        {editable && hasValue ? (
          <TouchableOpacity
            style={styles.clearButton}
            onPress={() => onChangeText?.('')}
            activeOpacity={0.85}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={16} color="#64748b" />
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }
);

ClearableTextInput.displayName = 'ClearableTextInput';

const styles = StyleSheet.create({
  container: {
    width: '100%',
    position: 'relative',
  },
  inputPadding: {
    paddingRight: 42,
  },
  clearButton: {
    position: 'absolute',
    right: 14,
    top: '50%',
    marginTop: -14,
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: 'rgba(226, 232, 240, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#dbe4ec',
  },
});
