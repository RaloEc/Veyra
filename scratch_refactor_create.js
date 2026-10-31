const fs = require('fs');
let code = fs.readFileSync('d:/Programas/Veyra/app/create.tsx', 'utf8');

const startMarker = '                        {/* ─── 2. SECCIÓN: CUÁNDO (FECHA, HORA Y REPETICIÓN) ─── */}';
const endMarker = '                    </ScrollView>';

const startIndex = code.indexOf(startMarker);
const endIndex = code.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
    console.error('Markers not found', { startIndex, endIndex });
    process.exit(1);
}

const newModularSections = `                        {/* ─── 2. SECCIÓN: CUÁNDO (FECHA Y HORA) ─── */}
                        <View style={styles.sectionWrapper}>
                            <View style={styles.sectionHeader}>
                                <View style={styles.sectionHeaderLeft}>
                                    <View style={[styles.sectionIconBadge, { backgroundColor: \`\${accent.primary}18\` }]}>
                                        <CalendarIcon size={15} color={accent.primary as any} strokeWidth={2.3} />
                                    </View>
                                    <View>
                                        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                                            Programación
                                        </Text>
                                        <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
                                            Momento en el que sonará tu recordatorio
                                        </Text>
                                    </View>
                                </View>
                            </View>

                            <View
                                style={[
                                    styles.sectionCard,
                                    {
                                        backgroundColor: cardBgColor,
                                        borderColor: cardBorderColor,
                                    },
                                ]}
                            >
                                {/* Presets rápidos */}
                                <View style={styles.presetsBlock}>
                                    <Text style={[styles.microLabel, { color: colors.textMuted }]}>
                                        AJUSTE RÁPIDO
                                    </Text>
                                    <ScrollView
                                        horizontal
                                        showsHorizontalScrollIndicator={false}
                                        contentContainerStyle={styles.presetsQuickRow}
                                    >
                                        {[
                                            { key: 'tonight', label: 'Esta noche (20:00)', icon: Moon },
                                            { key: 'tomorrow_9am', label: 'Mañana (09:00)', icon: Sun },
                                            { key: 'weekend', label: 'Fin de semana', icon: CalendarIcon },
                                            { key: 'plus_1h', label: 'En +1 hora', icon: Zap },
                                        ].map(p => {
                                            const IconComp = p.icon;
                                            const isSelected = activePreset === p.key;
                                            return (
                                                <TouchableOpacity
                                                    key={p.key}
                                                    style={[
                                                        styles.presetQuickChip,
                                                        {
                                                            backgroundColor: isSelected ? \`\${accent.primary}18\` : controlBgColor,
                                                            borderColor: isSelected ? accent.primary : controlBorderColor,
                                                        },
                                                    ]}
                                                    activeOpacity={0.75}
                                                    onPress={() => handleQuickDatePreset(p.key as any)}
                                                >
                                                    <IconComp size={13} color={(isSelected ? accent.primary : colors.textSecondary) as any} />
                                                    <Text
                                                        style={[
                                                            styles.presetQuickText,
                                                            {
                                                                color: isSelected ? accent.primary : colors.textPrimary,
                                                                fontWeight: isSelected ? '700' : '600',
                                                            },
                                                        ]}
                                                    >
                                                        {p.label}
                                                    </Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </ScrollView>
                                </View>

                                <View style={[styles.cardInternalDivider, { backgroundColor: colors.borderSubtle }]} />

                                {/* Fila Fecha */}
                                <TouchableOpacity
                                    activeOpacity={0.7}
                                    onPress={() => {
                                        setActivePreset(null);
                                        setShowDatePicker(true);
                                    }}
                                    style={styles.interactiveRow}
                                >
                                    <View style={styles.rowIconLabel}>
                                        <View style={[styles.rowMiniIcon, { backgroundColor: controlBgColor }]}>
                                            <CalendarIcon size={16} color={accent.primary as any} />
                                        </View>
                                        <View>
                                            <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>Fecha</Text>
                                            <Text style={[styles.rowHint, { color: colors.textMuted }]}>Día del aviso</Text>
                                        </View>
                                    </View>

                                    <View style={[styles.valuePill, { backgroundColor: controlBgColor, borderColor: controlBorderColor }]}>
                                        <Text style={[styles.valuePillText, { color: accent.primary }]}>
                                            {getFormattedDateBadge(date)}
                                        </Text>
                                        <ChevronRight size={14} color={colors.textMuted as any} />
                                    </View>
                                </TouchableOpacity>

                                <View style={[styles.cardInternalDivider, { backgroundColor: colors.borderSubtle }]} />

                                {/* Fila Hora */}
                                <TouchableOpacity
                                    activeOpacity={0.7}
                                    onPress={() => {
                                        setActivePreset(null);
                                        setShowTimePicker(true);
                                    }}
                                    style={styles.interactiveRow}
                                >
                                    <View style={styles.rowIconLabel}>
                                        <View style={[styles.rowMiniIcon, { backgroundColor: controlBgColor }]}>
                                            <Clock size={16} color={accent.primary as any} />
                                        </View>
                                        <View>
                                            <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>Hora</Text>
                                            <Text style={[styles.rowHint, { color: colors.textMuted }]}>Momento exacto</Text>
                                        </View>
                                    </View>

                                    <View style={[styles.valuePill, { backgroundColor: controlBgColor, borderColor: controlBorderColor }]}>
                                        <Text style={[styles.valuePillText, { color: accent.primary }]}>
                                            {format(date, 'HH:mm')}
                                        </Text>
                                        <ChevronRight size={14} color={colors.textMuted as any} />
                                    </View>
                                </TouchableOpacity>

                                <View style={[styles.cardInternalDivider, { backgroundColor: colors.borderSubtle }]} />

                                {/* Nivel de Control integrado y compacto */}
                                <View style={{ gap: 6, paddingTop: 2 }}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Text style={[styles.microLabel, { color: colors.textMuted, marginBottom: 0 }]}>
                                            NIVEL DE ALERTA
                                        </Text>
                                        <Text style={{ fontSize: 11.5, color: currentControlLevel.color, fontWeight: '700' }}>
                                            {currentControlLevel.label} ({currentControlLevel.shortDesc})
                                        </Text>
                                    </View>
                                    <View style={styles.priorityCompactRow}>
                                        {CONTROL_LEVELS.map(item => {
                                            const isSelected = controlLevel === item.key;
                                            const ItemIcon = item.icon;
                                            return (
                                                <TouchableOpacity
                                                    key={item.key}
                                                    activeOpacity={0.75}
                                                    onPress={() => setControlLevel(item.key)}
                                                    style={[
                                                        styles.priorityCompactBtn,
                                                        {
                                                            backgroundColor: isSelected
                                                                ? (isDark ? \`\${item.color}24\` : \`\${item.color}14\`)
                                                                : controlBgColor,
                                                            borderColor: isSelected ? item.color : controlBorderColor,
                                                        },
                                                    ]}
                                                >
                                                    <ItemIcon
                                                        size={14}
                                                        color={isSelected ? item.color : (colors.textMuted as any)}
                                                        strokeWidth={isSelected ? 2.5 : 2}
                                                    />
                                                    <Text
                                                        style={[
                                                            styles.priorityCompactText,
                                                            {
                                                                color: isSelected ? (isDark ? '#FFFFFF' : item.color) : colors.textSecondary,
                                                                fontWeight: isSelected ? '700' : '500',
                                                            },
                                                        ]}
                                                    >
                                                        {item.label}
                                                    </Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                </View>
                            </View>
                        </View>

                        {/* ─── BOTÓN DE ACORDEÓN: OPCIONES AVANZADAS ─── */}
                        <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => setIsAdvancedOpen(!isAdvancedOpen)}
                            style={[
                                styles.advancedToggleBar,
                                {
                                    backgroundColor: cardBgColor,
                                    borderColor: cardBorderColor,
                                },
                            ]}
                        >
                            <View style={styles.advancedToggleLeft}>
                                <View style={[styles.advancedToggleIconBadge, { backgroundColor: isAdvancedOpen ? \`\${accent.primary}20\` : controlBgColor }]}>
                                    <Sliders size={15} color={(isAdvancedOpen ? accent.primary : colors.textSecondary) as any} />
                                </View>
                                <View>
                                    <Text style={[styles.advancedToggleTitle, { color: colors.textPrimary }]}>
                                        Opciones avanzadas
                                    </Text>
                                    <Text style={[styles.advancedToggleSub, { color: colors.textMuted }]}>
                                        Repetición, subtareas, etiquetas, adjuntos...
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.advancedToggleRight}>
                                {advancedActiveCount > 0 && (
                                    <View style={[styles.advancedBadgeCount, { backgroundColor: \`\${accent.primary}18\` }]}>
                                        <Text style={[styles.advancedBadgeCountText, { color: accent.primary }]}>
                                            {advancedActiveCount} activa{advancedActiveCount === 1 ? '' : 's'}
                                        </Text>
                                    </View>
                                )}
                                <View style={[styles.advancedChevronCircle, { backgroundColor: controlBgColor }]}>
                                    {isAdvancedOpen ? (
                                        <ChevronDown size={16} color={accent.primary as any} />
                                    ) : (
                                        <ChevronRight size={16} color={colors.textMuted as any} />
                                    )}
                                </View>
                            </View>
                        </TouchableOpacity>

                        {/* ─── CONTENIDO AVANZADO (DESPLEGABLE) ─── */}
                        {isAdvancedOpen && (
                            <View style={styles.advancedContentWrapper}>
                                {/* 3. Repetición y Vinculación */}
                                <View style={styles.sectionWrapper}>
                                    <View style={styles.sectionHeader}>
                                        <View style={styles.sectionHeaderLeft}>
                                            <View style={[styles.sectionIconBadge, { backgroundColor: \`\${accent.primary}18\` }]}>
                                                <Repeat size={15} color={accent.primary as any} strokeWidth={2.3} />
                                            </View>
                                            <View>
                                                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                                                    Frecuencia y Vinculación
                                                </Text>
                                                <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
                                                    Repetición periódica o vínculo a un evento
                                                </Text>
                                            </View>
                                        </View>
                                    </View>

                                    <View
                                        style={[
                                            styles.sectionCard,
                                            {
                                                backgroundColor: cardBgColor,
                                                borderColor: cardBorderColor,
                                            },
                                        ]}
                                    >
                                        {/* Fila Repetición */}
                                        <TouchableOpacity
                                            activeOpacity={0.7}
                                            onPress={() => setIsRecurrenceModalVisible(true)}
                                            style={styles.interactiveRow}
                                        >
                                            <View style={styles.rowIconLabel}>
                                                <View style={[styles.rowMiniIcon, { backgroundColor: controlBgColor }]}>
                                                    <Repeat
                                                        size={16}
                                                        color={recurrenceType !== 'none' ? (accent.primary as any) : (colors.textMuted as any)}
                                                    />
                                                </View>
                                                <View>
                                                    <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>Repetir</Text>
                                                    <Text style={[styles.rowHint, { color: colors.textMuted }]}>Frecuencia de reaparición</Text>
                                                </View>
                                            </View>

                                            <View
                                                style={[
                                                    styles.valuePill,
                                                    {
                                                        backgroundColor: recurrenceType !== 'none' ? \`\${accent.primary}15\` : controlBgColor,
                                                        borderColor: recurrenceType !== 'none' ? \`\${accent.primary}40\` : controlBorderColor,
                                                    },
                                                ]}
                                            >
                                                <Text
                                                    style={[
                                                        styles.valuePillText,
                                                        {
                                                            color: recurrenceType !== 'none' ? accent.primary : colors.textSecondary,
                                                        },
                                                    ]}
                                                >
                                                    {getRecurrenceLabel(recurrenceType)}
                                                </Text>
                                                <ChevronRight size={14} color={(recurrenceType !== 'none' ? accent.primary : colors.textMuted) as any} />
                                            </View>
                                        </TouchableOpacity>

                                        <View style={[styles.cardInternalDivider, { backgroundColor: colors.borderSubtle }]} />

                                        {/* Vincular a Evento */}
                                        {linkedEvent ? (
                                            <View style={styles.linkedEventContainer}>
                                                <View
                                                    style={[
                                                        styles.linkedEventBox,
                                                        {
                                                            backgroundColor: controlBgColor,
                                                            borderColor: controlBorderColor,
                                                        },
                                                    ]}
                                                >
                                                    <View style={[styles.sectionIconBadge, { backgroundColor: \`\${accent.primary}20\` }]}>
                                                        <CalendarIcon size={16} color={accent.primary as any} />
                                                    </View>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={[styles.linkedCardTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                                                            {linkedEvent.title}
                                                        </Text>
                                                        <Text style={[styles.linkedCardSub, { color: colors.textSecondary }]}>
                                                            {linkedEvent.is_all_day
                                                                ? \`Todo el día (\${linkedEvent.all_day_date || ''})\`
                                                                : format(new Date(linkedEvent.start_time_ms), \"EEEE d 'de' MMMM • HH:mm\", { locale: es })}
                                                        </Text>
                                                    </View>
                                                    <TouchableOpacity
                                                        onPress={() => {
                                                            setEventId(null);
                                                            setOffsetMinutes(null);
                                                        }}
                                                        style={{ padding: 6 }}
                                                    >
                                                        <X size={16} color=\"#EF4444\" />
                                                    </TouchableOpacity>
                                                </View>

                                                <Text style={[styles.subLabel, { color: colors.textSecondary, marginTop: 4 }]}>
                                                    Momento de la alarma:
                                                </Text>
                                                <View style={styles.offsetChipsRow}>
                                                    {OFFSET_PRESETS.map((preset) => {
                                                        const isSelected = (offsetMinutes ?? 0) === preset.value;
                                                        return (
                                                            <TouchableOpacity
                                                                key={preset.value}
                                                                activeOpacity={0.7}
                                                                onPress={() => setOffsetMinutes(preset.value)}
                                                                style={[
                                                                    styles.optionChip,
                                                                    {
                                                                        backgroundColor: isSelected
                                                                            ? \`\${accent.primary}20\`
                                                                            : controlBgColor,
                                                                        borderColor: isSelected ? accent.primary : controlBorderColor,
                                                                    },
                                                                ]}
                                                            >
                                                                {isSelected && <Check size={12} color={accent.primary as any} strokeWidth={2.5} />}
                                                                <Text
                                                                    style={[
                                                                        styles.optionChipText,
                                                                        {
                                                                            color: isSelected ? accent.primary : colors.textSecondary,
                                                                            fontWeight: isSelected ? '700' : '500',
                                                                        },
                                                                    ]}
                                                                >
                                                                    {preset.label}
                                                                </Text>
                                                            </TouchableOpacity>
                                                        );
                                                    })}
                                                </View>
                                            </View>
                                        ) : (
                                            <TouchableOpacity
                                                activeOpacity={0.7}
                                                onPress={() => setIsEventPickerVisible(true)}
                                                style={styles.interactiveRow}
                                            >
                                                <View style={styles.rowIconLabel}>
                                                    <View style={[styles.rowMiniIcon, { backgroundColor: controlBgColor }]}>
                                                        <LinkIcon size={16} color={accent.primary as any} />
                                                    </View>
                                                    <View>
                                                        <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>Vincular a un evento</Text>
                                                        <Text style={[styles.rowHint, { color: colors.textMuted }]}>Sincronizar alarma con una reunión</Text>
                                                    </View>
                                                </View>

                                                <View style={[styles.valuePill, { backgroundColor: controlBgColor, borderColor: controlBorderColor }]}>
                                                    <Text style={[styles.valuePillText, { color: colors.textSecondary }]}>
                                                        Ninguno
                                                    </Text>
                                                    <ChevronRight size={14} color={colors.textMuted as any} />
                                                </View>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                </View>

                                {/* 4. Subtareas / Checklist */}
                                <View style={styles.sectionWrapper}>
                                    <View style={styles.sectionHeader}>
                                        <View style={styles.sectionHeaderLeft}>
                                            <View style={[styles.sectionIconBadge, { backgroundColor: \`\${accent.primary}18\` }]}>
                                                <CheckSquare size={15} color={accent.primary as any} strokeWidth={2.3} />
                                            </View>
                                            <View>
                                                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                                                    Subtareas
                                                </Text>
                                                <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
                                                    Divide el recordatorio en pasos accionables
                                                </Text>
                                            </View>
                                        </View>

                                        {subtasks.length > 0 && (
                                            <View style={[styles.counterPill, { backgroundColor: \`\${accent.primary}18\` }]}>
                                                <Text style={[styles.counterPillText, { color: accent.primary }]}>
                                                    {completedSubtasks}/{subtasks.length}
                                                </Text>
                                            </View>
                                        )}
                                    </View>

                                    <View
                                        style={[
                                            styles.sectionCard,
                                            {
                                                backgroundColor: cardBgColor,
                                                borderColor: cardBorderColor,
                                            },
                                        ]}
                                    >
                                        <View
                                            style={[
                                                styles.flatBoxInputRow,
                                                {
                                                    backgroundColor: controlBgColor,
                                                    borderColor: controlBorderColor,
                                                },
                                            ]}
                                        >
                                            <Plus size={16} color={colors.textMuted as any} />
                                            <TextInput
                                                style={[styles.flatBoxTextInput, { color: colors.textPrimary }]}
                                                placeholder=\"Escribe un paso o subtarea...\"
                                                placeholderTextColor={colors.textMuted}
                                                value={newSubtaskTitle}
                                                onChangeText={setNewSubtaskTitle}
                                                onSubmitEditing={handleAddSubtask}
                                                returnKeyType=\"done\"
                                            />
                                            <TouchableOpacity
                                                activeOpacity={0.7}
                                                disabled={!newSubtaskTitle.trim()}
                                                onPress={handleAddSubtask}
                                                style={[
                                                    styles.inlineAddBtn,
                                                    {
                                                        backgroundColor: newSubtaskTitle.trim() ? accent.primary : controlBgColor,
                                                        opacity: newSubtaskTitle.trim() ? 1 : 0.5,
                                                    },
                                                ]}
                                            >
                                                <Text
                                                    style={[
                                                        styles.inlineAddBtnText,
                                                        {
                                                            color: newSubtaskTitle.trim() ? colors.textInverse : colors.textMuted,
                                                        },
                                                    ]}
                                                >
                                                    Añadir
                                                </Text>
                                            </TouchableOpacity>
                                        </View>

                                        {subtasks.length > 0 ? (
                                            <View style={styles.subtasksList}>
                                                {subtasks.map((item) => (
                                                    <View
                                                        key={item.id}
                                                        style={[
                                                            styles.subtaskItemRow,
                                                            {
                                                                backgroundColor: controlBgColor,
                                                                borderColor: controlBorderColor,
                                                            },
                                                        ]}
                                                    >
                                                        <TouchableOpacity
                                                            style={styles.subtaskLeft}
                                                            onPress={() => {
                                                                setSubtasks(prev => prev.map(s => s.id === item.id ? { ...s, completed: !s.completed } : s));
                                                            }}
                                                            activeOpacity={0.7}
                                                        >
                                                            {item.completed ? (
                                                                <CheckSquare size={18} color={accent.primary as any} />
                                                            ) : (
                                                                <Square size={18} color={colors.textMuted as any} />
                                                            )}
                                                            <Text
                                                                style={[
                                                                    styles.subtaskText,
                                                                    {
                                                                        color: item.completed ? colors.textMuted : colors.textPrimary,
                                                                        textDecorationLine: item.completed ? 'line-through' : 'none',
                                                                    },
                                                                ]}
                                                                numberOfLines={2}
                                                            >
                                                                {item.title}
                                                            </Text>
                                                        </TouchableOpacity>
                                                        <TouchableOpacity
                                                            onPress={() => setSubtasks(prev => prev.filter(s => s.id !== item.id))}
                                                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                                            style={styles.subtaskDeleteBtn}
                                                        >
                                                            <X size={15} color={colors.textMuted as any} />
                                                        </TouchableOpacity>
                                                    </View>
                                                ))}
                                            </View>
                                        ) : (
                                            <Text style={[styles.emptyHintText, { color: colors.textMuted }]}>
                                                No hay subtareas añadidas todavía.
                                            </Text>
                                        )}
                                    </View>
                                </View>

                                {/* 5. Etiquetas */}
                                <View style={styles.sectionWrapper}>
                                    <View style={styles.sectionHeader}>
                                        <View style={styles.sectionHeaderLeft}>
                                            <View style={[styles.sectionIconBadge, { backgroundColor: \`\${accent.primary}18\` }]}>
                                                <TagIcon size={15} color={accent.primary as any} strokeWidth={2.3} />
                                            </View>
                                            <View>
                                                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                                                    Etiquetas
                                                </Text>
                                                <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
                                                    Organiza y filtra tus recordatorios
                                                </Text>
                                            </View>
                                        </View>
                                        {tags.length > 0 && (
                                            <View style={[styles.counterPill, { backgroundColor: \`\${accent.primary}18\` }]}>
                                                <Text style={[styles.counterPillText, { color: accent.primary }]}>
                                                    {tags.length}
                                                </Text>
                                            </View>
                                        )}
                                    </View>

                                    <View
                                        style={[
                                            styles.sectionCard,
                                            {
                                                backgroundColor: cardBgColor,
                                                borderColor: cardBorderColor,
                                            },
                                        ]}
                                    >
                                        <View
                                            style={[
                                                styles.flatBoxInputRow,
                                                {
                                                    backgroundColor: controlBgColor,
                                                    borderColor: controlBorderColor,
                                                },
                                            ]}
                                        >
                                            <TagIcon size={15} color={colors.textMuted as any} />
                                            <TextInput
                                                placeholder=\"Nueva etiqueta (ej: finanzas, compras)...\"
                                                placeholderTextColor={colors.textMuted}
                                                value={customTagInput}
                                                onChangeText={setCustomTagInput}
                                                onSubmitEditing={() => handleAddTag(customTagInput)}
                                                returnKeyType=\"done\"
                                                style={[styles.flatBoxTextInput, { color: colors.textPrimary }]}
                                            />
                                            <TouchableOpacity
                                                activeOpacity={0.7}
                                                disabled={!customTagInput.trim()}
                                                onPress={() => handleAddTag(customTagInput)}
                                                style={[
                                                    styles.inlineAddBtn,
                                                    {
                                                        backgroundColor: customTagInput.trim() ? accent.primary : controlBgColor,
                                                        opacity: customTagInput.trim() ? 1 : 0.5,
                                                    },
                                                ]}
                                            >
                                                <Text
                                                    style={[
                                                        styles.inlineAddBtnText,
                                                        {
                                                            color: customTagInput.trim() ? colors.textInverse : colors.textMuted,
                                                        },
                                                    ]}
                                                >
                                                    Añadir
                                                </Text>
                                            </TouchableOpacity>
                                        </View>

                                        {tags.length > 0 && (
                                            <View style={styles.activeTagsBlock}>
                                                <Text style={[styles.microLabel, { color: colors.textMuted }]}>
                                                    ACTIVAS
                                                </Text>
                                                <View style={styles.tagsContainer}>
                                                    {tags.map(tItem => (
                                                        <View
                                                            key={tItem}
                                                            style={[
                                                                styles.tagBadgeActive,
                                                                {
                                                                    backgroundColor: \`\${accent.primary}18\`,
                                                                    borderColor: \`\${accent.primary}45\`,
                                                                },
                                                            ]}
                                                        >
                                                            <Text style={[styles.tagBadgeText, { color: accent.primary, fontWeight: '700' }]}>
                                                                #{tItem}
                                                            </Text>
                                                            <TouchableOpacity
                                                                activeOpacity={0.7}
                                                                onPress={() => handleRemoveTag(tItem)}
                                                                style={styles.tagRemoveBtn}
                                                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                                            >
                                                                <X size={12} color={accent.primary as any} />
                                                            </TouchableOpacity>
                                                        </View>
                                                    ))}
                                                </View>
                                            </View>
                                        )}

                                        <View style={styles.suggestedTagsBlock}>
                                            <Text style={[styles.microLabel, { color: colors.textMuted }]}>
                                                SUGERENCIAS RÁPIDAS
                                            </Text>
                                            <View style={styles.tagChipsWrap}>
                                                {PRESET_TAGS.map(preset => {
                                                    const isSelected = tags.includes(preset);
                                                    return (
                                                        <TouchableOpacity
                                                            key={preset}
                                                            activeOpacity={0.7}
                                                            onPress={() => isSelected ? handleRemoveTag(preset) : handleAddTag(preset)}
                                                            style={[
                                                                styles.tagChipPreset,
                                                                {
                                                                    backgroundColor: isSelected
                                                                        ? \`\${accent.primary}20\`
                                                                        : controlBgColor,
                                                                    borderColor: isSelected ? accent.primary : controlBorderColor,
                                                                },
                                                            ]}
                                                        >
                                                            <Text
                                                                style={[
                                                                    styles.tagChipPresetText,
                                                                    {
                                                                        color: isSelected ? accent.primary : colors.textSecondary,
                                                                        fontWeight: isSelected ? '700' : '500',
                                                                    },
                                                                ]}
                                                            >
                                                                #{preset}
                                                            </Text>
                                                            {isSelected && <Check size={11} color={accent.primary as any} style={{ marginLeft: 4 }} />}
                                                        </TouchableOpacity>
                                                    );
                                                })}
                                            </View>
                                        </View>
                                    </View>
                                </View>

                                {/* 6. Archivos Adjuntos */}
                                <View style={styles.sectionWrapper}>
                                    <View style={styles.sectionHeader}>
                                        <View style={styles.sectionHeaderLeft}>
                                            <View style={[styles.sectionIconBadge, { backgroundColor: \`\${accent.primary}18\` }]}>
                                                <Paperclip size={15} color={accent.primary as any} strokeWidth={2.3} />
                                            </View>
                                            <View>
                                                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                                                    Archivos Adjuntos
                                                </Text>
                                                <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
                                                    Fotos de referencia o documentos
                                                </Text>
                                            </View>
                                        </View>

                                        <View
                                            style={[
                                                styles.counterPill,
                                                {
                                                    backgroundColor: isAttachmentLimitReached
                                                        ? (isDark ? 'rgba(251, 113, 133, 0.15)' : 'rgba(225, 29, 72, 0.12)')
                                                        : \`\${accent.primary}18\`,
                                                },
                                            ]}
                                        >
                                            <Text
                                                style={[
                                                    styles.counterPillText,
                                                    {
                                                        color: isAttachmentLimitReached ? (isDark ? '#FB7185' : '#E11D48') : accent.primary,
                                                    },
                                                ]}
                                            >
                                                {attachments.length}/{MAX_ATTACHMENTS}
                                            </Text>
                                        </View>
                                    </View>

                                    <View
                                        style={[
                                            styles.sectionCard,
                                            {
                                                backgroundColor: cardBgColor,
                                                borderColor: cardBorderColor,
                                            },
                                        ]}
                                    >
                                        <View style={styles.attachOptionsGrid}>
                                            <TouchableOpacity
                                                activeOpacity={0.75}
                                                disabled={isAttachmentLimitReached}
                                                onPress={() => pickImage(true)}
                                                style={[
                                                    styles.attachOptionTile, {
                                                        backgroundColor: controlBgColor,
                                                        borderColor: controlBorderColor,
                                                        opacity: isAttachmentLimitReached ? 0.45 : 1,
                                                    },
                                                ]}
                                            >
                                                <View style={[styles.attachTileIcon, { backgroundColor: \`\${accent.primary}15\` }]}>
                                                    <Camera size={17} color={accent.primary as any} />
                                                </View>
                                                <Text style={[styles.attachTileTitle, { color: colors.textPrimary }]}>
                                                    Cámara
                                                </Text>
                                                <Text style={[styles.attachTileSub, { color: colors.textMuted }]}>
                                                    Tomar foto
                                                </Text>
                                            </TouchableOpacity>

                                            <TouchableOpacity
                                                activeOpacity={0.75}
                                                disabled={isAttachmentLimitReached}
                                                onPress={() => pickImage(false)}
                                                style={[
                                                    styles.attachOptionTile, {
                                                        backgroundColor: controlBgColor,
                                                        borderColor: controlBorderColor,
                                                        opacity: isAttachmentLimitReached ? 0.45 : 1,
                                                    },
                                                ]}
                                            >
                                                <View style={[styles.attachTileIcon, { backgroundColor: \`\${accent.primary}15\` }]}>
                                                    <ImageIcon size={17} color={accent.primary as any} />
                                                </View>
                                                <Text style={[styles.attachTileTitle, { color: colors.textPrimary }]}>
                                                    Galería
                                                </Text>
                                                <Text style={[styles.attachTileSub, { color: colors.textMuted }]}>
                                                    Elegir imagen
                                                </Text>
                                            </TouchableOpacity>

                                            <TouchableOpacity
                                                activeOpacity={0.75}
                                                disabled={isAttachmentLimitReached}
                                                onPress={pickDocument}
                                                style={[
                                                    styles.attachOptionTile, {
                                                        backgroundColor: controlBgColor,
                                                        borderColor: controlBorderColor,
                                                        opacity: isAttachmentLimitReached ? 0.45 : 1,
                                                    },
                                                ]}
                                            >
                                                <View style={[styles.attachTileIcon, { backgroundColor: \`\${accent.primary}15\` }]}>
                                                    <Paperclip size={17} color={accent.primary as any} />
                                                </View>
                                                <Text style={[styles.attachTileTitle, { color: colors.textPrimary }]}>
                                                    Archivo
                                                </Text>
                                                <Text style={[styles.attachTileSub, { color: colors.textMuted }]}>
                                                    PDF o doc
                                                </Text>
                                            </TouchableOpacity>
                                        </View>

                                        <AttachmentsSection
                                            attachments={attachments}
                                            MAX_ATTACHMENTS={MAX_ATTACHMENTS}
                                            pickImage={pickImage}
                                            pickDocument={pickDocument}
                                            openAttachment={openAttachment}
                                            removeAttachment={removeAttachment}
                                            isDark={isDark}
                                            flat={true}
                                        />
                                    </View>
                                </View>
                            </View>
                        )}`;

code = code.substring(0, startIndex) + newModularSections + code.substring(endIndex);

const styleInsertTarget = `    emptyEventsText: {
        textAlign: 'center',
        paddingVertical: 20,
        fontSize: 13,
    },`;

const styleInsertReplacement = `    emptyEventsText: {
        textAlign: 'center',
        paddingVertical: 20,
        fontSize: 13,
    },
    priorityCompactRow: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 2,
    },
    priorityCompactBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 9,
        borderRadius: 10,
        borderWidth: 1,
    },
    priorityCompactText: {
        fontSize: 13,
    },
    advancedToggleBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 16,
        borderWidth: 1,
    },
    advancedToggleLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flex: 1,
    },
    advancedToggleIconBadge: {
        width: 34,
        height: 34,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    advancedToggleTitle: {
        fontSize: 14.5,
        fontWeight: '700',
    },
    advancedToggleSub: {
        fontSize: 11.5,
        marginTop: 1,
    },
    advancedToggleRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    advancedBadgeCount: {
        paddingHorizontal: 8,
        paddingVertical: 3.5,
        borderRadius: 8,
    },
    advancedBadgeCountText: {
        fontSize: 11,
        fontWeight: '700',
    },
    advancedChevronCircle: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    advancedContentWrapper: {
        gap: 20,
    },`;

code = code.replace(styleInsertTarget, styleInsertReplacement);

fs.writeFileSync('d:/Programas/Veyra/app/create.tsx', code, 'utf8');
console.log('Finished refactoring app/create.tsx');
