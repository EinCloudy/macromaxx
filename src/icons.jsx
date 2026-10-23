import React from 'react';
import {
  Keyboard, Globe, AppWindow, TextCursorInput, Music2, Webhook, Video, Folder,
  Layers, Timer, Puzzle, Mic, MicOff, Headphones, Volume2, Play, Pause, SkipForward,
  Camera, Monitor, Code2, Terminal, Mail, MessageCircle, Heart, Star, Zap, Coffee,
  Rocket, Sun, Moon, Lightbulb, Power, Home, Search, FolderOpen, Radio, Circle,
  Check, ArrowLeft, Send, Link, Bell, Flame, Gamepad2, Youtube, Twitch, Settings2,
  Plus, ChevronsUpDown, LayoutGrid, Activity, ChevronRight, Cloud as CloudCheck, CloudUpload,
  CircleHelp, Download, PanelsTopLeft, Pencil, Undo2, Redo2, Ellipsis, Usb,
  MousePointer2, Layers2, Square, SlidersHorizontal, Copy, Trash2, Sparkles, Shapes,
  ChevronDown, ChevronUp, GripVertical, ArrowUpRight, ImagePlus, X, Workflow,
  CircleAlert, Info, CheckCircle2, CircleStop, CircleDot, KeyRound, RefreshCw,
  Unplug, Plug, Package, Upload,
} from 'lucide-react';
const L = {
  Keyboard, Globe, AppWindow, TextCursorInput, Music2, Webhook, Video, Folder,
  Layers, Timer, Puzzle, Mic, MicOff, Headphones, Volume2, Play, Pause, SkipForward,
  Camera, Monitor, Code2, Terminal, Mail, MessageCircle, Heart, Star, Zap, Coffee,
  Rocket, Sun, Moon, Lightbulb, Power, Home, Search, FolderOpen, Radio, Circle,
  Check, ArrowLeft, Send, Link, Bell, Flame, Gamepad2, Youtube, Twitch, Settings2,
  Plus, ChevronsUpDown, LayoutGrid, Activity, ChevronRight, CloudCheck, CloudUpload,
  CircleHelp, Download, PanelsTopLeft, Pencil, Undo2, Redo2, Ellipsis, Usb,
  MousePointer2, Layers2, Square, SlidersHorizontal, Copy, Trash2, Sparkles, Shapes,
  ChevronDown, ChevronUp, GripVertical, ArrowUpRight, ImagePlus, X, Workflow,
  CircleAlert, Info, CheckCircle2, CircleStop, CircleDot, KeyRound, RefreshCw,
  Unplug, Plug, Package, Upload,
};
export const iconNames = ['Keyboard', 'Globe', 'AppWindow', 'TextCursorInput', 'Music2', 'Webhook', 'Video', 'Folder', 'Layers', 'Timer', 'Puzzle', 'Mic', 'MicOff', 'Headphones', 'Volume2', 'Play', 'Pause', 'SkipForward', 'Camera', 'Monitor', 'Code2', 'Terminal', 'Mail', 'MessageCircle', 'Heart', 'Star', 'Zap', 'Coffee', 'Rocket', 'Sun', 'Moon', 'Lightbulb', 'Power', 'Home', 'Search', 'FolderOpen', 'Radio', 'Circle', 'Check', 'ArrowLeft', 'Send', 'Link', 'Bell', 'Flame', 'Gamepad2', 'Youtube', 'Twitch', 'Settings2'];
export function Icon({ name, size = 20, ...props }) { const Component = L[name] || L.Zap; return <Component size={size} strokeWidth={1.7} {...props} />; }
