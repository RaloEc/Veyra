import React from 'react';
import {
    Folder,
    Briefcase,
    BookOpen,
    Lightbulb,
    Code,
    Layers,
    Star,
    Sparkles,
    Shield,
    Zap,
    Bookmark,
    GraduationCap,
    ShoppingBag,
    Music,
    Globe,
    Compass,
    Lock,
    Coffee,
    Heart,
    Tag,
    Archive,
    Smile,
    Flame,
    Home,
} from '@tamagui/lucide-icons';

export interface FolderIconOption {
    key: string;
    labelEs: string;
    labelEn: string;
    IconComponent: React.ComponentType<any>;
}

export const FOLDER_ICONS: FolderIconOption[] = [
    { key: 'folder', labelEs: 'General', labelEn: 'General', IconComponent: Folder },
    { key: 'briefcase', labelEs: 'Trabajo', labelEn: 'Work', IconComponent: Briefcase },
    { key: 'book-open', labelEs: 'Estudio', labelEn: 'Study', IconComponent: BookOpen },
    { key: 'lightbulb', labelEs: 'Ideas', labelEn: 'Ideas', IconComponent: Lightbulb },
    { key: 'code', labelEs: 'Código', labelEn: 'Code', IconComponent: Code },
    { key: 'layers', labelEs: 'Proyectos', labelEn: 'Projects', IconComponent: Layers },
    { key: 'star', labelEs: 'Favoritos', labelEn: 'Starred', IconComponent: Star },
    { key: 'sparkles', labelEs: 'Inspiración', labelEn: 'Inspiration', IconComponent: Sparkles },
    { key: 'zap', labelEs: 'Rápidas', labelEn: 'Quick', IconComponent: Zap },
    { key: 'shield', labelEs: 'Privado', labelEn: 'Private', IconComponent: Shield },
    { key: 'bookmark', labelEs: 'Marcadores', labelEn: 'Bookmarks', IconComponent: Bookmark },
    { key: 'graduation-cap', labelEs: 'Universidad', labelEn: 'Academic', IconComponent: GraduationCap },
    { key: 'shopping-bag', labelEs: 'Compras', labelEn: 'Shopping', IconComponent: ShoppingBag },
    { key: 'music', labelEs: 'Música', labelEn: 'Music', IconComponent: Music },
    { key: 'globe', labelEs: 'Viajes / Web', labelEn: 'Travel / Web', IconComponent: Globe },
    { key: 'compass', labelEs: 'Planes', labelEn: 'Plans', IconComponent: Compass },
    { key: 'lock', labelEs: 'Seguro', labelEn: 'Secure', IconComponent: Lock },
    { key: 'coffee', labelEs: 'Personal', labelEn: 'Personal', IconComponent: Coffee },
    { key: 'heart', labelEs: 'Salud', labelEn: 'Health', IconComponent: Heart },
    { key: 'tag', labelEs: 'Etiqueta', labelEn: 'Tag', IconComponent: Tag },
    { key: 'archive', labelEs: 'Archivo', labelEn: 'Archive', IconComponent: Archive },
    { key: 'smile', labelEs: 'Diario', labelEn: 'Journal', IconComponent: Smile },
    { key: 'flame', labelEs: 'Prioritario', labelEn: 'Priority', IconComponent: Flame },
    { key: 'home', labelEs: 'Hogar', labelEn: 'Home', IconComponent: Home },
];

export const FOLDER_COLORS: { key: string; color: string; nameEs: string; nameEn: string }[] = [
    { key: 'purple', color: '#8B5CF6', nameEs: 'Púrpura', nameEn: 'Purple' },
    { key: 'indigo', color: '#6366F1', nameEs: 'Índigo', nameEn: 'Indigo' },
    { key: 'blue', color: '#3B82F6', nameEs: 'Azul', nameEn: 'Blue' },
    { key: 'cyan', color: '#06B6D4', nameEs: 'Cian', nameEn: 'Cyan' },
    { key: 'teal', color: '#14B8A6', nameEs: 'Turquesa', nameEn: 'Teal' },
    { key: 'emerald', color: '#10B981', nameEs: 'Esmeralda', nameEn: 'Emerald' },
    { key: 'lime', color: '#84CC16', nameEs: 'Lima', nameEn: 'Lime' },
    { key: 'amber', color: '#F59E0B', nameEs: 'Ámbar', nameEn: 'Amber' },
    { key: 'orange', color: '#F97316', nameEs: 'Naranja', nameEn: 'Orange' },
    { key: 'rose', color: '#F43F5E', nameEs: 'Rosa', nameEn: 'Rose' },
    { key: 'pink', color: '#EC4899', nameEs: 'Fucsia', nameEn: 'Pink' },
    { key: 'slate', color: '#64748B', nameEs: 'Pizarra', nameEn: 'Slate' },
];

interface FolderIconRendererProps {
    name?: string;
    size?: number;
    color?: string;
    strokeWidth?: number;
}

export const FolderIconRenderer: React.FC<FolderIconRendererProps> = React.memo(({
    name = 'folder',
    size = 18,
    color = '#8B5CF6',
    strokeWidth = 2,
}) => {
    const found = FOLDER_ICONS.find(item => item.key === name);
    const IconComponent = found ? found.IconComponent : Folder;

    return <IconComponent size={size} color={color as any} strokeWidth={strokeWidth} />;
});
