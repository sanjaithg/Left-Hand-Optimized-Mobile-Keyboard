import React, { useState, useCallback, useMemo, memo } from 'react';
import { 
    View, Dimensions, StyleSheet, Text, 
    TouchableOpacity, Platform, Vibration 
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
    CONTROL_BG: '#e6e6e6',
    CONTROL_BTN: '#d1d1d1',
};

const DEFAULTS = {
    RADIUS: width * 1.25,
    OFFSET_X: 0,
    OFFSET_Y: 40,
};

const CONSTANTS = {
    BOTTOM_INSET: Platform.OS === 'ios' ? 34 : 20, 
    RADIUS_STEP: 55, 
};

/* =========================
   1. LAYOUT CONFIGURATION
   ========================= */

const LAYOUT_ALPHA = [
    // Row 0 (QWERTY)
    { 
        chars: ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'], 
        radialDepth: 0, 
        startAngle: 15,  
        keyWidth: 5.5,    
        gap: 0.2          
    }, 
    // Row 1 (ASDF)
    { 
        chars: ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'], 
        radialDepth: 1, 
        startAngle: 18, 
        keyWidth: 5.5, 
        gap: 0.2 
    }, 
    // Row 2 (SHIFT + ZXCV)
    { 
        chars: ['SHIFT', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'DELETE'], 
        radialDepth: 2, 
        startAngle: 15, 
        keyWidth: 5.6, 
        gap: 0.25 
    }, 
];

const LAYOUT_NUMERIC = [
    { 
        chars: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'], 
        radialDepth: 0, startAngle: 15, keyWidth: 5.5, gap: 0.2 
    }, 
    { 
        chars: ['@', '#', '$', '_', '&', '-', '+', '(', ')', '/'], 
        radialDepth: 1, startAngle: 18, keyWidth: 5.5, gap: 0.2 
    }, 
    { 
        chars: ['SHIFT', '*', '"', "'", ':', ';', '!', '?', 'DELETE'], 
        radialDepth: 2, startAngle: 8, keyWidth: 5.6, gap: 0.25 
    }, 
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

const ArcVisual = memo(({ keyData, isShifted, centerY }) => {
    const { keyChar, isSpecial, innerRadius, outerRadius, keyStartAngle, keyEndAngle, keyCenterAngle, centerX } = keyData;

    // Safety check
    const allValid = [innerRadius, outerRadius, keyStartAngle, keyEndAngle, keyCenterAngle].every(v => typeof v === 'number' && isFinite(v));
    if (!allValid) return null;

    const innerStart = polarToCartesian(centerX, centerY, innerRadius, keyStartAngle);
    const innerEnd = polarToCartesian(centerX, centerY, innerRadius, keyEndAngle);
    const outerStart = polarToCartesian(centerX, centerY, outerRadius, keyStartAngle);
    const outerEnd = polarToCartesian(centerX, centerY, outerRadius, keyEndAngle);
    
    // SVG Path Definition
    const arcPath = `
        M ${innerStart.x} ${innerStart.y}
        L ${outerStart.x} ${outerStart.y}
        A ${outerRadius} ${outerRadius} 0 0 1 ${outerEnd.x} ${outerEnd.y}
        L ${innerEnd.x} ${innerEnd.y}
        A ${innerRadius} ${innerRadius} 0 0 0 ${innerStart.x} ${innerStart.y}
        Z
    `;

    const textRadius = (innerRadius + outerRadius) / 2;
    const textPosition = polarToCartesian(centerX, centerY, textRadius, keyCenterAngle);
    
    const rotation = keyCenterAngle; 

    // Styling Logic
    let keyFill = isSpecial ? COLORS.KEY_SPECIAL : COLORS.KEY_PRIMARY;
    if (keyChar === 'SHIFT' && isShifted) keyFill = COLORS.ACCENT;
    if (keyChar === 'DELETE' || keyChar === 'RETURN') keyFill = COLORS.RED;
    if (keyChar === '123' || keyChar === 'ABC') keyFill = COLORS.ACCENT;
    if (keyChar === '<' || keyChar === '>') keyFill = '#555'; 

    // Label Logic
    let displayChar = keyChar;
    if (keyChar === 'SHIFT') displayChar = '⇧';
    if (keyChar === 'DELETE') displayChar = '⌫';
    if (keyChar === 'RETURN') displayChar = '↵';
    if (keyChar === 'SPACE') displayChar = 'space';
    if (keyChar === '<') displayChar = '←';
    if (keyChar === '>') displayChar = '→';
    
    // Case switching
    if (keyChar.length === 1 && /[a-zA-Z]/.test(keyChar)) {
        displayChar = isShifted ? keyChar.toUpperCase() : keyChar.toLowerCase();
    }
    
    return (
        <G>
            <Path
                d={arcPath}
                fill={keyFill} 
                stroke={COLORS.WHITE}
                strokeWidth="1"
            />
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


const ArcKey = memo(({ keyData, onPress, centerY }) => {
    const { 
        keyChar, innerRadius, outerRadius, 
        keyCenterAngle, widthAngle, centerX
    } = keyData;

    const keyHeight = outerRadius - innerRadius;
    const textRadius = (innerRadius + outerRadius) / 2;
    const keyCenterPos = polarToCartesian(centerX, centerY, textRadius, keyCenterAngle);
    
    const rotation = keyCenterAngle - 90;
    
    const approximateWidth = textRadius * (Math.abs(widthAngle) * Math.PI / 180);

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

// --- Settings Control Component ---
const SettingRow = ({ label, value, onChange, step = 10, min, max }) => (
    <View style={styles.settingRow}>
        <Text style={styles.settingLabel}>{label}</Text>
        <View style={styles.stepperContainer}>
            <TouchableOpacity 
                style={styles.stepperBtn} 
                onPress={() => {
                    const newVal = value - step;
                    if(min !== undefined && newVal < min) return;
                    onChange(newVal);
                }}
            >
                <Text style={styles.stepperBtnText}>-</Text>
            </TouchableOpacity>
            
            <Text style={styles.settingValue}>{Math.round(value)}</Text>
            
            <TouchableOpacity 
                style={styles.stepperBtn} 
                onPress={() => {
                    const newVal = value + step;
                    if(max !== undefined && newVal > max) return;
                    onChange(newVal);
                }}
            >
                <Text style={styles.stepperBtnText}>+</Text>
            </TouchableOpacity>
        </View>
    </View>
);

/* =========================
   MAIN APP COMPONENT
   ========================= */

export default function App() {
    // --- STATE ---
    const [typedText, setTypedText] = useState('');
    const [cursorIndex, setCursorIndex] = useState(0); 
    const [isShifted, setIsShifted] = useState(false); 
    const [layoutMode, setLayoutMode] = useState('ALPHA');
    const [handMode, setHandMode] = useState('LEFT'); 
    const [showSettings, setShowSettings] = useState(false);

    // --- CUSTOMIZABLE GEOMETRY STATE ---
    const [customRadius, setCustomRadius] = useState(DEFAULTS.RADIUS);
    const [customOffsetX, setCustomOffsetX] = useState(DEFAULTS.OFFSET_X);
    const [customOffsetY, setCustomOffsetY] = useState(DEFAULTS.OFFSET_Y);

    const resetSettings = () => {
        setCustomRadius(DEFAULTS.RADIUS);
        setCustomOffsetX(DEFAULTS.OFFSET_X);
        setCustomOffsetY(DEFAULTS.OFFSET_Y);
    };

    const handleKeyPress = useCallback((char) => {
        Vibration.vibrate(10); 
        setTypedText(currentText => {
            let newText = currentText;

            if (char === '<') {
                setCursorIndex(prev => Math.max(0, prev - 1));
                return currentText;
            }
            if (char === '>') {
                setCursorIndex(prev => Math.min(currentText.length, prev + 1));
                return currentText;
            }

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

            if (char === 'DELETE') {
                if (cursorIndex > 0) {
                    newText = currentText.slice(0, cursorIndex - 1) + currentText.slice(cursorIndex);
                    setCursorIndex(prev => prev - 1);
                }
                return newText;
            }

            if (char === 'RETURN') {
                 newText = currentText.slice(0, cursorIndex) + '\n' + currentText.slice(cursorIndex);
                 setCursorIndex(prev => prev + 1);
                 return newText;
            }

            let textToAdd = char;
            if (char === 'SPACE') textToAdd = ' ';
            else if (layoutMode === 'ALPHA') {
                textToAdd = isShifted ? char.toUpperCase() : char.toLowerCase();
            }

            newText = currentText.slice(0, cursorIndex) + textToAdd + currentText.slice(cursorIndex);
            setCursorIndex(prev => prev + 1);
            return newText;
        });

        if (isShifted && char.length === 1 && char !== '<' && char !== '>') setIsShifted(false);
    }, [isShifted, layoutMode, cursorIndex]);


    // --- GEOMETRY ENGINE ---
    const activeCenterY = height - CONSTANTS.BOTTOM_INSET + customOffsetY;

    const allKeys = useMemo(() => {
        const keys = [];
        const activeLayout = layoutMode === 'ALPHA' ? LAYOUT_ALPHA : LAYOUT_NUMERIC;
        const isRightHanded = handMode === 'RIGHT';

        // 1. Dynamic Center X with User Adjustment
        // We add the customOffsetX to the base hand position
        const baseHandX = isRightHanded ? width * 1.2 : width * -0.2;
        const dynamicCenterX = baseHandX + customOffsetX;

        // 2. Direction Multiplier
        const dir = isRightHanded ? -1 : 1;

        const calculateKeyGeometry = (char, startAngle, widthAngle, innerRadius, outerRadius, isSpecial = false) => {
            const keyEndAngle = startAngle + (widthAngle * dir);
            const keyCenterAngle = startAngle + ((widthAngle * dir) / 2);

            return {
                keyChar: char,
                isSpecial,
                innerRadius,
                outerRadius,
                keyCenterAngle,
                keyStartAngle: startAngle, 
                keyEndAngle,   
                widthAngle: widthAngle * dir,
                centerX: dynamicCenterX 
            };
        };

        // 3. Generate Main Rows
        activeLayout.forEach((row) => {
            // Use customRadius instead of constant
            const outerRadius = customRadius - (row.radialDepth * CONSTANTS.RADIUS_STEP);
            const innerRadius = outerRadius - CONSTANTS.RADIUS_STEP;
            
            let currentAngle = row.startAngle * dir; 
            
            row.chars.forEach(char => {
                const thisKeyWidth = char.length > 1 ? 9 : row.keyWidth;
                const isSpecial = char.length > 1;

                keys.push(calculateKeyGeometry(char, currentAngle, thisKeyWidth, innerRadius, outerRadius, isSpecial));
                currentAngle += ((thisKeyWidth + row.gap) * dir); 
            });
        });

        // 4. Generate Control Row
        const controlRowDepth = 3; 
        const controlOuterRadius = customRadius - (controlRowDepth * CONSTANTS.RADIUS_STEP);
        const controlInnerRadius = controlOuterRadius - CONSTANTS.RADIUS_STEP;

        const addControlKey = (char, angle, widthVal) => {
             keys.push(calculateKeyGeometry(char, angle * dir, widthVal, controlInnerRadius, controlOuterRadius, true));
        };

        const toggleLabel = layoutMode === 'ALPHA' ? '123' : 'ABC';
        addControlKey(toggleLabel, 19, 7);
        addControlKey('<', 27, 7);
        addControlKey('SPACE', 35, 20);
        addControlKey('>', 56, 7);
        addControlKey('RETURN', 64, 7);

        return keys;
    }, [width, height, layoutMode, handMode, customRadius, customOffsetX]); 

    const renderTextWithCursor = () => {
        const beforeCursor = typedText.slice(0, cursorIndex);
        const afterCursor = typedText.slice(cursorIndex);
        return (
            <Text style={styles.typedText}>
                {beforeCursor}
                <Text style={{ color: COLORS.CURSOR, fontWeight: 'bold' }}>|</Text>
                {afterCursor}
            </Text>
        );
    };

    return (
        <View style={styles.container}>
            
            {/* TOP HEADER */}
            <View style={styles.header}>
                <View style={styles.toggleContainer}>
                    <TouchableOpacity 
                        style={[styles.toggleBtn, handMode === 'LEFT' && styles.toggleBtnActive]}
                        onPress={() => setHandMode('LEFT')}
                    >
                        <Text style={[styles.toggleText, handMode === 'LEFT' && styles.toggleTextActive]}>Left</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                        style={[styles.toggleBtn, handMode === 'RIGHT' && styles.toggleBtnActive]}
                        onPress={() => setHandMode('RIGHT')}
                    >
                        <Text style={[styles.toggleText, handMode === 'RIGHT' && styles.toggleTextActive]}>Right</Text>
                    </TouchableOpacity>
                </View>
            </View>

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

            {/* SETTINGS TOGGLE & PANEL */}
            <View style={styles.controlsWrapper}>
                <TouchableOpacity 
                    style={styles.settingsToggle}
                    onPress={() => setShowSettings(!showSettings)}
                >
                    <Text style={styles.settingsToggleText}>
                        {showSettings ? "Hide Settings" : "⚙️ Tune Layout"}
                    </Text>
                </TouchableOpacity>

                {showSettings && (
                    <View style={styles.settingsPanel}>
                        <SettingRow 
                            label="Curvature (Radius)" 
                            value={customRadius} 
                            onChange={setCustomRadius} 
                            step={15}
                        />
                        <SettingRow 
                            label="Horizontal Pos (X)" 
                            value={customOffsetX} 
                            onChange={setCustomOffsetX} 
                            step={10}
                        />
                        <SettingRow 
                            label="Vertical Pos (Y)" 
                            value={customOffsetY} 
                            onChange={setCustomOffsetY} 
                            step={10}
                        />
                        <TouchableOpacity style={styles.resetBtn} onPress={resetSettings}>
                            <Text style={styles.resetBtnText}>Reset to Default</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>

            <View style={styles.suggestionRow}>
                <Text style={{ color: '#999', fontSize: 12 }}>
                    {layoutMode === 'NUMERIC' ? 'Numbers' : 'Alpha'} | {handMode} Hand
                </Text>
            </View>

            {/* KEYBOARD OVERLAY */}
            <View style={styles.keyboardContainer}> 
                <Svg.Svg height={height} width={width} style={styles.svgOverlay}>
                    <G> 
                        {allKeys.map((keyData) => (
                            <ArcVisual 
                                key={keyData.keyChar + keyData.keyCenterAngle} 
                                keyData={keyData} 
                                isShifted={isShifted}
                                centerY={activeCenterY}
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
                            centerY={activeCenterY}
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
    header: {
        flexDirection: 'row',
        justifyContent: 'flex-end', 
        paddingHorizontal: 15,
        marginBottom: 10,
    },
    toggleContainer: {
        flexDirection: 'row',
        backgroundColor: '#e0e0e0',
        borderRadius: 20,
        padding: 2,
    },
    toggleBtn: {
        paddingVertical: 6,
        paddingHorizontal: 15,
        borderRadius: 18,
    },
    toggleBtnActive: {
        backgroundColor: COLORS.WHITE,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 1,
        elevation: 2,
    },
    toggleText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#888',
    },
    toggleTextActive: {
        color: COLORS.KEY_PRIMARY,
    },
    inputContainer: {
        backgroundColor: COLORS.TEXT_INPUT_BG,
        borderBottomWidth: 1,
        borderColor: '#ccc',
        paddingHorizontal: 15,
        paddingVertical: 15,
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 0,
    },
    typedText: {
        fontSize: 22,
        color: '#000',
        flex: 1,
        minHeight: 30,
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
    // --- SETTINGS STYLES ---
    controlsWrapper: {
        padding: 10,
        zIndex: 20, // Ensure it sits above the keyboard SVG if there is overlap
    },
    settingsToggle: {
        alignSelf: 'center',
        padding: 8,
        marginBottom: 5,
    },
    settingsToggleText: {
        color: COLORS.ACCENT,
        fontWeight: '600',
    },
    settingsPanel: {
        backgroundColor: COLORS.WHITE,
        padding: 15,
        borderRadius: 12,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 5,
    },
    settingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    settingLabel: {
        fontSize: 14,
        color: '#333',
        fontWeight: '500',
        flex: 1,
    },
    stepperContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.CONTROL_BG,
        borderRadius: 8,
        padding: 2,
    },
    stepperBtn: {
        backgroundColor: COLORS.CONTROL_BTN,
        width: 30,
        height: 30,
        borderRadius: 6,
        alignItems: 'center',
        justifyContent: 'center',
    },
    stepperBtnText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#555',
    },
    settingValue: {
        width: 50,
        textAlign: 'center',
        fontSize: 14,
        fontWeight: 'bold',
        color: '#333',
    },
    resetBtn: {
        marginTop: 5,
        padding: 10,
        backgroundColor: '#f0f0f0',
        borderRadius: 8,
        alignItems: 'center',
    },
    resetBtnText: {
        color: COLORS.RED,
        fontSize: 12,
        fontWeight: '600',
    },
    suggestionRow: {
        flexDirection: 'row',
        paddingVertical: 2,
        justifyContent: 'center',
        alignItems: 'center',
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