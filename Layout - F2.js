import React, { useState, useCallback, useMemo, memo, useRef, useEffect } from 'react';
import { 
    View, Dimensions, StyleSheet, Text, 
    TouchableOpacity, Platform, Vibration, Animated 
} from 'react-native';
import * as Svg from 'react-native-svg'; 

const { Path, G, Text: SvgText } = Svg;
const { width, height } = Dimensions.get('window');

/* =========================
   CONFIG & UTILITIES
   ========================= */

const COLORS = {
    BACKGROUND: '#f2f2f2', 
    KEY_PRIMARY: '#2b2b2b',   
    KEY_SPECIAL: '#4a4a4a',       
    WHITE: '#fff',
    TEXT_INPUT_BG: '#ffffff',
    RED: '#e02424',
    ACCENT: '#007aff', 
    CURSOR: '#007aff',
    SELECTION_BG: '#b3d7ff', // Light blue for selected text
};

const KEYBOARD_CONFIG = {
    RADIUS_BASE: width * 1.25, 
    ARC_CENTER_X_OFFSET: width * -0.17, 
    ARC_CENTER_Y_ADJUSTMENT: 40, 
    BOTTOM_INSET_PIXELS: Platform.OS === 'ios' ? 34 : 20, 
    RADIUS_STEP: 55, 
    TOUCH_AREA_WIDTH: 55,
};

// --- CALCULATED CONSTANTS ---
const RADIUS_BASE = KEYBOARD_CONFIG.RADIUS_BASE;   
const KEYBOARD_HEIGHT = height; 
const CENTER_X = KEYBOARD_CONFIG.ARC_CENTER_X_OFFSET; 
const CENTER_Y = KEYBOARD_HEIGHT - KEYBOARD_CONFIG.BOTTOM_INSET_PIXELS + KEYBOARD_CONFIG.ARC_CENTER_Y_ADJUSTMENT; 
const { RADIUS_STEP } = KEYBOARD_CONFIG;


/* =========================
   1. LAYOUT CONFIGURATION
   ========================= */

const LAYOUT_ALPHA = [
    { chars: ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'], radialDepth: 1, startAngle: 17.7, keyWidth: 5, gap: 0.2 }, 
    { chars: ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'], radialDepth: 2, startAngle: 18, keyWidth: 5.5, gap: 0.2 }, 
    { chars: ['SHIFT', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'DELETE'], radialDepth: 3, startAngle: 17, keyWidth: 5.6, gap: 0.25 }, 
];

const LAYOUT_NUMERIC = [
    { chars: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'], radialDepth: 1, startAngle: 17.7, keyWidth: 5, gap: 0.2  }, 
    { chars: ['@', '#', '$', '_', '&', '-', '+', '(', ')', '/'], radialDepth: 2, startAngle: 18, keyWidth: 5.5, gap: 0.2}, 
    { chars: ['SHIFT', '*', '"', "'", ':', ';', '!', '?', 'DELETE'], radialDepth: 3, startAngle: 17, keyWidth: 5.6, gap: 0.25 },
];


// Helper: Polar to Cartesian
const polarToCartesian = (center_x, center_y, radius, angleInDegrees) => {
    const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
    return {
        x: center_x + (radius * Math.cos(angleInRadians)),
        y: center_y + (radius * Math.sin(angleInRadians))
    };
};

/* =========================
   VISUAL COMPONENTS
   ========================= */

const ArcVisual = memo(({ keyData, isShifted }) => {
    const { keyChar, isSpecial, innerRadius, outerRadius, keyStartAngle, keyEndAngle, keyCenterAngle } = keyData;

    const allValid = [innerRadius, outerRadius, keyStartAngle, keyEndAngle, keyCenterAngle].every(v => typeof v === 'number' && isFinite(v));
    if (!allValid) return null;

    const innerStart = polarToCartesian(CENTER_X, CENTER_Y, innerRadius, keyStartAngle);
    const innerEnd = polarToCartesian(CENTER_X, CENTER_Y, innerRadius, keyEndAngle);
    const outerStart = polarToCartesian(CENTER_X, CENTER_Y, outerRadius, keyStartAngle);
    const outerEnd = polarToCartesian(CENTER_X, CENTER_Y, outerRadius, keyEndAngle);
    
    const arcPath = `
        M ${innerStart.x} ${innerStart.y}
        L ${outerStart.x} ${outerStart.y}
        A ${outerRadius} ${outerRadius} 0 0 1 ${outerEnd.x} ${outerEnd.y}
        L ${innerEnd.x} ${innerEnd.y}
        A ${innerRadius} ${innerRadius} 0 0 0 ${innerStart.x} ${innerStart.y}
        Z
    `;

    const textRadius = (innerRadius + outerRadius) / 2;
    const textPosition = polarToCartesian(CENTER_X, CENTER_Y, textRadius, keyCenterAngle);
    const rotation = keyCenterAngle; 

    let keyFill = isSpecial ? COLORS.KEY_SPECIAL : COLORS.KEY_PRIMARY;
    if (keyChar === 'SHIFT' && isShifted) keyFill = COLORS.ACCENT;
    if (keyChar === 'DELETE' || keyChar === 'RETURN') keyFill = COLORS.RED;
    if (keyChar === '123' || keyChar === 'ABC') keyFill = COLORS.ACCENT;
    if (keyChar === '<' || keyChar === '>') keyFill = '#555'; 

    let displayChar = keyChar;
    if (keyChar === 'SHIFT') displayChar = '⇧';
    if (keyChar === 'DELETE') displayChar = '⌫';
    if (keyChar === 'RETURN') displayChar = '↵';
    if (keyChar === 'SPACE') displayChar = 'space';
    if (keyChar === '<') displayChar = '←';
    if (keyChar === '>') displayChar = '→';
    
    if (keyChar.length === 1 && /[a-zA-Z]/.test(keyChar)) {
        displayChar = isShifted ? keyChar.toUpperCase() : keyChar.toLowerCase();
    }
    
    return (
        <G>
            <Path d={arcPath} fill={keyFill} stroke={COLORS.WHITE} strokeWidth="1" />
            <SvgText
                x={textPosition.x}
                y={textPosition.y}
                fontSize="15" 
                fontWeight="bold"
                fill={COLORS.WHITE}
                textAnchor="middle" 
                alignmentBaseline="middle"
                transform={`rotate(${rotation} ${textPosition.x} ${textPosition.y})`}
            >
                {displayChar}
            </SvgText>
        </G>
    );
});


const ArcKey = memo(({ keyData, onPress }) => {
    const { keyChar, innerRadius, outerRadius, keyCenterAngle, widthAngle } = keyData;
    const keyHeight = outerRadius - innerRadius;
    const textRadius = (innerRadius + outerRadius) / 2;
    const keyCenterPos = polarToCartesian(CENTER_X, CENTER_Y, textRadius, keyCenterAngle);
    const rotation = keyCenterAngle - 90;
    const approximateWidth = textRadius * (widthAngle * Math.PI / 180);

    return (
        <TouchableOpacity 
            onPress={() => onPress(keyChar)}
            delayPressIn={0} 
            activeOpacity={0.3}
            style={{
                position: 'absolute',
                width: approximateWidth + 10, 
                height: keyHeight,
                left: keyCenterPos.x - ((approximateWidth + 10) / 2),
                top: keyCenterPos.y - (keyHeight / 2), 
                transform: [{ rotate: `${rotation}deg` }],
                backgroundColor: 'transparent',
                zIndex: 10, 
            }}
        />
    );
});

/* =========================
   MAIN APP COMPONENT
   ========================= */

export default function App() {
    const [typedText, setTypedText] = useState('');
    
    // Selection State: start and end index of the selection
    // If start === end, it's just a cursor.
    const [selection, setSelection] = useState({ start: 0, end: 0 });
    
    const [isShifted, setIsShifted] = useState(false); 
    const [layoutMode, setLayoutMode] = useState('ALPHA');
    const [isSelectMode, setIsSelectMode] = useState(false); // Toggle for highlighting

    // Animated value for Blinking Cursor
    const cursorOpacity = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(cursorOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
                Animated.timing(cursorOpacity, { toValue: 1, duration: 500, useNativeDriver: true })
            ])
        ).start();
    }, []);

    const handleKeyPress = useCallback((char) => {
        Vibration.vibrate(10); 
        
        setTypedText(currentText => {
            let newText = currentText;
            let { start, end } = selection;

            // Helper to ensure min/max are correct for slice operations
            const minPos = Math.min(start, end);
            const maxPos = Math.max(start, end);
            const hasSelection = start !== end;

            // --- CURSOR & SELECTION MOVEMENT ---
            if (char === '<') {
                if (isSelectMode) {
                    // Move START to the left, expanding/contracting selection
                    const newPos = Math.max(0, start - 1);
                    setSelection(prev => ({ ...prev, start: newPos }));
                } else {
                    // Normal cursor move (collapse selection if exists)
                    const newPos = hasSelection ? minPos : Math.max(0, start - 1);
                    setSelection({ start: newPos, end: newPos });
                }
                return currentText;
            }
            
            if (char === '>') {
                if (isSelectMode) {
                    // Move END to the right
                    const newPos = Math.min(currentText.length, end + 1);
                    setSelection(prev => ({ ...prev, end: newPos }));
                } else {
                    // Normal cursor move
                    const newPos = hasSelection ? maxPos : Math.min(currentText.length, end + 1);
                    setSelection({ start: newPos, end: newPos });
                }
                return currentText;
            }

            // --- MODE SWITCHING ---
            if (char === 'SHIFT') {
                setIsShifted(prev => !prev);
                return currentText;
            }
            if (char === '123') {
                setLayoutMode('NUMERIC');
                return currentText;
            }
            if (char === 'ABC') {
                setLayoutMode('ALPHA');
                return currentText;
            }

            // --- DELETION ---
            if (char === 'DELETE') {
                if (hasSelection) {
                    // Delete the highlighted range
                    newText = currentText.slice(0, minPos) + currentText.slice(maxPos);
                    setSelection({ start: minPos, end: minPos });
                } else {
                    // Normal backspace
                    if (start > 0) {
                        newText = currentText.slice(0, start - 1) + currentText.slice(start);
                        setSelection({ start: start - 1, end: start - 1 });
                    }
                }
                return newText;
            }

            // --- RETURN ---
            if (char === 'RETURN') {
                 // Replace selection with newline or insert newline
                 newText = currentText.slice(0, minPos) + '\n' + currentText.slice(maxPos);
                 setSelection({ start: minPos + 1, end: minPos + 1 });
                 return newText;
            }

            // --- NORMAL TYPING ---
            let textToAdd = char;
            if (char === 'SPACE') textToAdd = ' ';
            else if (layoutMode === 'ALPHA') {
                textToAdd = isShifted ? char.toUpperCase() : char.toLowerCase();
            }

            // Replaces selection if one exists, otherwise inserts at cursor
            newText = currentText.slice(0, minPos) + textToAdd + currentText.slice(maxPos);
            setSelection({ start: minPos + 1, end: minPos + 1 });

            // Exit select mode after typing
            if (isSelectMode) setIsSelectMode(false);

            return newText;
        });

        if (isShifted && char.length === 1 && char !== '<' && char !== '>') setIsShifted(false);

    }, [isShifted, layoutMode, selection, isSelectMode]);


    // --- GEOMETRY ENGINE ---
    const allKeys = useMemo(() => {
        const keys = [];
        const activeLayout = layoutMode === 'ALPHA' ? LAYOUT_ALPHA : LAYOUT_NUMERIC;

        const calculateKeyGeometry = (char, startAngle, widthAngle, innerRadius, outerRadius, isSpecial = false) => {
            const keyEndAngle = startAngle + widthAngle;
            const keyCenterAngle = startAngle + (widthAngle / 2);
            return { keyChar: char, isSpecial, innerRadius, outerRadius, keyCenterAngle, keyStartAngle: startAngle, keyEndAngle, widthAngle };
        };

        // 1. Main Rows
        activeLayout.forEach((row) => {
            const outerRadius = RADIUS_BASE - (row.radialDepth * RADIUS_STEP);
            const innerRadius = outerRadius - RADIUS_STEP;
            let currentAngle = row.startAngle; 
            
            row.chars.forEach(char => {
                // Set Shift/Backspace Width to 6.0, others to default
                const thisKeyWidth = char.length > 1 ? 6.0 : row.keyWidth;
                const isSpecial = char.length > 1;
                keys.push(calculateKeyGeometry(char, currentAngle, thisKeyWidth, innerRadius, outerRadius, isSpecial));
                currentAngle += (thisKeyWidth + row.gap); 
            });
        });

        // 2. Control Row
        const controlRowDepth = 4; 
        const controlOuterRadius = RADIUS_BASE - (controlRowDepth * RADIUS_STEP);
        const controlInnerRadius = controlOuterRadius - RADIUS_STEP;

        // Manual Angles for Control Row
        keys.push(calculateKeyGeometry(layoutMode === 'ALPHA' ? '123' : 'ABC', 19, 7, controlInnerRadius, controlOuterRadius, true)); 
        keys.push(calculateKeyGeometry('<', 27, 7, controlInnerRadius, controlOuterRadius, true));
        keys.push(calculateKeyGeometry('SPACE', 35, 20, controlInnerRadius, controlOuterRadius, true)); 
        keys.push(calculateKeyGeometry('>', 56, 7, controlInnerRadius, controlOuterRadius, true));
        keys.push(calculateKeyGeometry('RETURN', 64, 7, controlInnerRadius, controlOuterRadius, true));

        return keys;
    }, [width, height, layoutMode]); 

    // --- TEXT RENDERING WITH HIGHLIGHT & BLINKING CURSOR ---
    const renderTextWithCursor = () => {
        const min = Math.min(selection.start, selection.end);
        const max = Math.max(selection.start, selection.end);
        const hasSelection = min !== max;

        const beforeSelection = typedText.slice(0, min);
        const selectedText = typedText.slice(min, max);
        const afterSelection = typedText.slice(max);

        return (
            <View style={styles.textWrapper}>
                <Text style={styles.typedText}>{beforeSelection}</Text>
                
                {/* Selection OR Blinking Cursor */}
                {hasSelection ? (
                    <Text style={[styles.typedText, { backgroundColor: COLORS.SELECTION_BG }]}>
                        {selectedText}
                    </Text>
                ) : (
                    <Animated.View style={{ opacity: cursorOpacity }}>
                        <Text style={[styles.typedText, { color: COLORS.CURSOR, marginHorizontal: -1 }]}>|</Text>
                    </Animated.View>
                )}

                <Text style={styles.typedText}>{afterSelection}</Text>
            </View>
        );
    };

    return (
        <View style={styles.container}>
            
            <View style={styles.inputContainer}>
                {renderTextWithCursor()}
                <TouchableOpacity 
                    style={styles.deleteButton} 
                    onPress={() => handleKeyPress('DELETE')}
                    delayPressIn={0}
                >
                    <Text style={styles.deleteButtonText}>⌫</Text>
                </TouchableOpacity>
            </View>

            {/* STATUS BAR WITH SELECT TOGGLE */}
            <View style={styles.suggestionRow}>
                <TouchableOpacity 
                    onPress={() => setIsSelectMode(!isSelectMode)}
                    style={[styles.modeButton, isSelectMode && styles.modeButtonActive]}
                >
                    <Text style={[styles.modeText, isSelectMode && styles.modeTextActive]}>
                        {isSelectMode ? 'SELECTING...' : 'SELECT MODE'}
                    </Text>
                </TouchableOpacity>
            </View>

            <View style={styles.keyboardContainer}> 
                <Svg.Svg height={KEYBOARD_HEIGHT} width={width} style={styles.svgOverlay}>
                    <G> 
                        {allKeys.map((keyData) => (
                            <ArcVisual 
                                key={keyData.keyChar + keyData.keyCenterAngle} 
                                keyData={keyData} 
                                isShifted={isShifted}
                            /> 
                        ))}
                    </G>
                </Svg.Svg>
                
                <View style={styles.touchOverlay}>
                    {allKeys.map((keyData) => (
                        <ArcKey 
                            key={'touch_' + keyData.keyChar + keyData.keyCenterAngle} 
                            keyData={keyData} 
                            onPress={handleKeyPress} 
                        /> 
                    ))}
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.BACKGROUND,
        paddingTop: Platform.OS === 'android' ? 30 : 50,
    },
    inputContainer: {
        backgroundColor: COLORS.TEXT_INPUT_BG,
        borderBottomWidth: 1,
        borderColor: '#ccc',
        paddingHorizontal: 15,
        paddingVertical: 15,
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 5,
    },
    textWrapper: {
        flexDirection: 'row',
        flex: 1,
        flexWrap: 'wrap',
        minHeight: 30,
        alignItems: 'center',
    },
    typedText: {
        fontSize: 22,
        color: '#000',
        fontWeight: '500',
    },
    deleteButton: {
        padding: 10,
        backgroundColor: '#eee',
        borderRadius: 8,
        marginLeft: 10,
    },
    deleteButtonText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: COLORS.RED,
    },
    suggestionRow: {
        flexDirection: 'row',
        paddingVertical: 5,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modeButton: {
        paddingHorizontal: 15,
        paddingVertical: 5,
        borderRadius: 15,
        borderWidth: 1,
        borderColor: '#ccc',
    },
    modeButtonActive: {
        backgroundColor: COLORS.ACCENT,
        borderColor: COLORS.ACCENT,
    },
    modeText: {
        fontSize: 12,
        color: '#666',
        fontWeight: 'bold',
    },
    modeTextActive: {
        color: '#fff',
    },
    keyboardContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        width: width,
        height: height,
        zIndex: 1, 
    },
    svgOverlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        zIndex: 5, 
    },
    touchOverlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        width: width,
        height: height,
        zIndex: 10, 
    },
});