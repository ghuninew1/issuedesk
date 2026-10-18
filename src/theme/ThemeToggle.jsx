import { useEffect, useRef, useState } from "react";
import { useTheme } from "../hooks/useTheme";
import { cx } from "../utils/cx";
import { Sun, Moon, Monitor } from "lucide-react";

const SunIcon = () => <Sun size={20} aria-hidden="true" />;

const MoonIcon = () => <Moon size={20} aria-hidden="true" />;

const SystemIcon = () => <Monitor size={20} aria-hidden="true" />;

const ThemeToggle = () => {
  const { theme, setTheme, themes } = useTheme();

  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  const options = [
    {
      value: themes.LIGHT,
      label: "Light",
      icon: <SunIcon />,
    },
    {
      value: themes.DARK,
      label: "Dark",
      icon: <MoonIcon />,
    },
    {
      value: themes.SYSTEM,
      label: "System",
      icon: <SystemIcon />,
    },
  ];

  const currentOption =
    options.find((option) => option.value === theme) ?? options[2];

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const handleThemeChange = (value) => {
    setTheme(value);
    setIsOpen(false);
  };

  return (
    <div
      ref={containerRef}
      className="group relative flex items-center justify-center"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      {/* Theme options */}
      <div
        id="theme-options"
        aria-label="Theme options"
        className={cx(
          "absolute right-0 top-0 z-20",
          "flex flex-col items-center gap-1 rounded-full",
          "border border-border bg-background p-1 shadow-md",
          "transition-all duration-200",
          isOpen
            ? "visible translate-y-0 opacity-100"
            : "invisible translate-y-1 opacity-0",
        )}
        aria-hidden={!isOpen}
      >
        {options.map(({ value, label, icon }) => {
          const isActive = theme === value;

          return (
            <button
              key={value}
              type="button"
              onClick={() => handleThemeChange(value)}
              aria-label={label}
              aria-pressed={isActive}
              title={label}
              tabIndex={isOpen ? 0 : -1}
              className={cx(
                "flex flex-col size-10 items-center justify-center rounded-full",
                "transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {icon}
            </button>
          );
        })}
      </div>

      {/* Current theme */}
      <button
        type="button"
        aria-label={`Theme: ${currentOption.label}`}
        aria-expanded={isOpen}
        aria-controls="theme-options"
        title={`Theme: ${currentOption.label}`}
        onClick={() => setIsOpen((previous) => !previous)}
        onFocus={() => setIsOpen(true)}
        className={cx(
          "relative z-10 flex size-10 items-center justify-center rounded-full",
          "border border-border bg-background text-muted-foreground shadow-sm",
          "transition-opacity duration-200",
          isOpen ? "opacity-0" : "opacity-100",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        {currentOption.icon}
      </button>
    </div>
  );
};

export default ThemeToggle;