import sys
import json
import html
from dataclasses import dataclass
from typing import Optional
from PyQt6.QtWidgets import (
    QApplication, QWidget, QHBoxLayout, QVBoxLayout,
    QLabel, QTextEdit, QPushButton, QScrollArea,
    QStackedWidget
)
from PyQt6.QtCore import Qt


LEVEL_UP_SLOTS = 12
ATTRIBUTES = ("STR", "AGI", "INT", "CHA")
DICE_PROGRESSION = ["D4", "D6", "D8", "D10", "D12", "D12+D4", "D20", "D20+D6"]


# -------------------------
# Module-level helpers
# -------------------------

def format_advancement_summary(entry):
    parts = []

    for attr in entry.get("Attributes", []):
        for key, value in attr.items():
            parts.append(f"+{value} {key}")

    if entry.get("HP"):
        parts.append(f"+{entry['HP']} HP")

    if entry.get("MOB"):
        parts.append(f"+{entry['MOB']} MOB")

    if entry.get("Brill"):
        parts.append(f"+{entry['Brill']} Brill")

    div_value = entry.get("DIV")
    if div_value == "Upgrade":
        parts.append("DIV Upgrade")
    elif div_value:
        parts.append(f"DIV {div_value}")

    parts.extend(entry.get("Keywords", []))

    for item in entry.get("Items", []):
        parts.append(f"{item['Name']} ({item['Type']})")

    for action in entry.get("Action cards", []):
        parts.append(f"{action['Name']} L{action['Level']}")

    return ", ".join(parts) if parts else "No changes"


def upgrade_div_die(div_die):
    if div_die not in DICE_PROGRESSION:
        return div_die

    current_index = DICE_PROGRESSION.index(div_die)
    if current_index == len(DICE_PROGRESSION) - 1:
        return div_die

    return DICE_PROGRESSION[current_index + 1]


def render_entry_extras(entry):
    """Compact extras string for button/popup labels.

    Includes keywords, attribute deltas, and optional stats that are present.
    Stats always shown on races (MOB, HP, DIV) are left to render_race_button
    so it can display them even when zero.
    """
    keywords = ", ".join(entry.get("Keywords", []))
    attributes = [
        f"{value:+} {key}"
        for attr in entry.get("Attributes", [])
        for key, value in attr.items()
    ]

    extras = []
    if keywords:
        extras.append(keywords)
    if attributes:
        extras.append(", ".join(attributes))
    for stat, label in (("MOB", "MOV"), ("HP", "HP"), ("DIV", "DIV"), ("Brill", "Brill")):
        value = entry.get(stat)
        if value is not None:
            extras.append(f"{label}: {value}")

    return ", ".join(extras)


@dataclass
class LevelUpSlotState:
    tree_name: Optional[str] = None
    level: Optional[int] = None
    version_index: Optional[int] = None

    def clear(self):
        self.tree_name = None
        self.level = None
        self.version_index = None

    def clear_version(self):
        self.version_index = None

    def select_tree(self, tree_name, level):
        self.tree_name = tree_name
        self.level = level
        self.version_index = None

    def select_version(self, version_index):
        self.version_index = version_index

    def has_tree_selected(self):
        return self.tree_name is not None and self.level is not None

    def matches_tree_option(self, option):
        return (
            self.tree_name == option["tree_name"]
            and self.level == option["level"]
        )

    def is_complete(self):
        return self.has_tree_selected() and self.version_index is not None


def build_empty_level_up_state():
    return [LevelUpSlotState() for _ in range(LEVEL_UP_SLOTS)]


# -------------------------
# Selection Popup
# -------------------------
# -------------------------
# Selector Button
# -------------------------
class SelectorButton(QPushButton):
    def __init__(
        self,
        items,
        render_popup_fn,
        render_button_fn,
        on_change,
        default_text,
        on_open_selector,
        parent=None
    ):
        super().__init__(parent)

        self.items = []
        self.render_popup_fn = render_popup_fn
        self.render_button_fn = render_button_fn
        self.on_change = on_change
        self.default_text = default_text
        self.on_open_selector = on_open_selector

        self.selected = None
        self.setFixedHeight(48)
        self.setStyleSheet("text-align: left; padding: 5px;")
        self.set_items(items)

        self.clicked.connect(self.open_selector)

    def set_items(self, items, selected=None):
        self.items = items
        if selected is not None:
            self.selected = selected
        else:
            self.selected = items[0] if len(items) == 1 else None
        self.setEnabled(bool(items))
        self.update_text()

    def update_text(self):
        if self.selected:
            self.setText(self.render_button_fn(self.selected))
        else:
            self.setText(self.default_text)

    def open_selector(self):
        if not self.items:
            return
        self.on_open_selector(self)

    def set_selected(self, item):
        self.selected = item
        self.update_text()
        self.on_change(item)


class LevelUpSection(QWidget):
    def __init__(
        self,
        level_number,
        render_tree_popup_fn,
        render_tree_button_fn,
        render_version_popup_fn,
        render_version_button_fn,
        on_tree_change,
        on_version_change,
        on_open_selector,
        parent=None
    ):
        super().__init__(parent)

        self.level_number = level_number

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(2)

        selectors_layout = QHBoxLayout()
        selectors_layout.setContentsMargins(0, 0, 0, 0)
        selectors_layout.setSpacing(3)

        self.tree_selector = SelectorButton(
            [],
            render_tree_popup_fn,
            render_tree_button_fn,
            on_tree_change,
            "Level up",
            on_open_selector
        )
        self.version_selector = SelectorButton(
            [],
            render_version_popup_fn,
            render_version_button_fn,
            on_version_change,
            "Choose reward",
            on_open_selector
        )

        selectors_layout.addWidget(self.tree_selector, 2)
        selectors_layout.addWidget(self.version_selector, 3)
        layout.addLayout(selectors_layout)

    def is_complete(self):
        return (
            self.tree_selector.selected is not None
            and self.version_selector.selected is not None
        )


# -------------------------
# Step Section
# -------------------------
class StepSection(QWidget):
    def __init__(
        self,
        title,
        render_popup_fn,
        render_button_fn,
        on_change,
        on_open_selector,
        parent=None
    ):
        super().__init__(parent)

        self.title = title
        self.render_popup_fn = render_popup_fn
        self.render_button_fn = render_button_fn
        self.on_change = on_change

        self.layout = QVBoxLayout(self)
        self.layout.setContentsMargins(0, 0, 0, 0)
        self.layout.setSpacing(2)
        self.items = []
        self.selector = SelectorButton(
            [],
            self.render_popup_fn,
            self.render_button_fn,
            self._handle_change,
            self.title,
            on_open_selector
        )
        self.layout.addWidget(self.selector)

    def set_items(self, items):
        self.items = items
        self.selector.set_items(items)

        if len(items) == 1:
            self._handle_change(items[0])

    def _handle_change(self, item):
        if self.on_change:
            self.on_change(item)

    def get_selected(self):
        if self.selector:
            return self.selector.selected
        return None


# -------------------------
# Advancement Tree Panel
# -------------------------
class AdvancementTreePanel(QWidget):
    def __init__(self, get_advancement_data_fn, parent=None):
        super().__init__(parent)
        self.get_advancement_data_fn = get_advancement_data_fn
        self._pending_refresh = False
        
        layout = QVBoxLayout(self)
        
        title = QLabel("Advancement Trees")
        title.setStyleSheet("font-weight: bold; font-size: 14px;")
        layout.addWidget(title)
        
        self.tree_display = QTextEdit()
        self.tree_display.setReadOnly(True)
        self.tree_display.setStyleSheet("""
            font-family: monospace; 
            font-size: 12px;
            background-color: white;
            color: black;
        """)
        layout.addWidget(self.tree_display)
        
    def refresh(self):
        viewport = self.tree_display.viewport()
        # Avoid triggering rich-text painting while the viewport is not ready yet.
        if not viewport.isVisible() or viewport.width() <= 0 or viewport.height() <= 0:
            self._pending_refresh = True
            return

        data = self.get_advancement_data_fn()
        self.tree_display.setHtml(data)
        self._pending_refresh = False

    def showEvent(self, event):
        super().showEvent(event)
        if self._pending_refresh:
            self.refresh()


# -------------------------
# Character Builder
# -------------------------
class CharacterBuilder(QWidget):
    def __init__(self):
        super().__init__()

        self.setWindowTitle("Lands of Evershade - RPG Builder")
        self.resize(1400, 700)

        with open("data.json", "r") as f:
            self.data = json.load(f)

        self._trees = {
            tree["Name"]: tree for tree in self.data["Advancement Trees"]
        }
        self._selected_race = None
        self._selected_attr = None
        self._selected_origin = None
        self._selected_prof = None
        self._selected_path = None
        self._level_up_state = build_empty_level_up_state()

        self.init_ui()

    def init_ui(self):
        main_layout = QHBoxLayout(self)

        # Left panel - Character creation
        self.left_controls_widget = QWidget()
        self.left_layout = QVBoxLayout(self.left_controls_widget)
        self.left_layout.setAlignment(Qt.AlignmentFlag.AlignTop)
        self.left_layout.setSpacing(2)

        # Steps
        self.race_step = StepSection(
            "Choose Race",
            self.render_race_button,
            self.render_race_button,
            self.on_race_selected,
            self.open_selector_panel
        )

        self.attr_step = StepSection(
            "Choose Attributes",
            self.render_attr_button,
            self.render_attr_button,
            self.on_attr_selected,
            self.open_selector_panel
        )

        self.origin_step = StepSection(
            "Choose Origin",
            self.render_origin_button,
            self.render_origin_button,
            self.on_origin_selected,
            self.open_selector_panel
        )

        self.prof_step = StepSection(
            "Choose Profession",
            self.render_prof_button,
            self.render_prof_button,
            self.on_prof_selected,
            self.open_selector_panel
        )

        self.path_step = StepSection(
            "Choose Path",
            self.render_path_button,
            self.render_path_button,
            self.on_path_selected,
            self.open_selector_panel
        )

        self._level_up_sections = []
        for level_number in range(1, LEVEL_UP_SLOTS + 1):
            section = LevelUpSection(
                level_number,
                self.render_level_up_tree_popup,
                self.render_level_up_tree_button,
                self.render_level_up_version_popup,
                self.render_level_up_version_button,
                lambda item, idx=level_number - 1: self.on_level_up_tree_selected(idx, item),
                lambda item, idx=level_number - 1: self.on_level_up_version_selected(idx, item),
                self.open_selector_panel
            )
            self._level_up_sections.append(section)

        for step in [
            self.race_step,
            self.attr_step,
            self.origin_step,
            self.prof_step,
            self.path_step
        ]:
            self.left_layout.addWidget(step)

        for section in self._level_up_sections:
            self.left_layout.addWidget(section)

        # Middle panel - Character Board
        middle_container = QWidget()
        middle_layout = QVBoxLayout(middle_container)
        middle_title = QLabel("Character board")
        middle_title.setStyleSheet("font-weight: bold; font-size: 14px;")
        middle_layout.addWidget(middle_title)
        self.summary = QTextEdit()
        self.summary.setReadOnly(True)
        self.summary.setStyleSheet("font-family: monospace; font-size: 11px; background-color: white;")
        middle_layout.addWidget(self.summary)

        # Right panel - Advancement Trees
        self._adv_panel = AdvancementTreePanel(self.get_advancement_tree_summary)
        
        # Scroll areas
        left_scroll = QScrollArea()
        left_scroll.setWidget(self.left_controls_widget)
        left_scroll.setWidgetResizable(True)

        # Left panel selector view (replaces controls while selecting)
        self._selector_panel = QWidget()
        selector_layout = QVBoxLayout(self._selector_panel)
        selector_layout.setContentsMargins(0, 0, 0, 0)
        selector_layout.setSpacing(4)

        self._selector_title = QLabel("Choose Option")
        self._selector_title.setStyleSheet("font-weight: bold; font-size: 14px;")
        selector_layout.addWidget(self._selector_title)

        selector_scroll = QScrollArea()
        selector_scroll.setWidgetResizable(True)
        self.selector_options_container = QWidget()
        self._selector_options_layout = QVBoxLayout(self.selector_options_container)
        self._selector_options_layout.setAlignment(Qt.AlignmentFlag.AlignTop)
        self._selector_options_layout.setSpacing(3)
        selector_scroll.setWidget(self.selector_options_container)
        selector_layout.addWidget(selector_scroll)

        self._left_stack = QStackedWidget()
        self._left_stack.addWidget(left_scroll)
        self._left_stack.addWidget(self._selector_panel)
        self._left_stack.setCurrentIndex(0)
        
        middle_scroll = QScrollArea()
        middle_scroll.setWidget(middle_container)
        middle_scroll.setWidgetResizable(True)
        
        right_scroll = QScrollArea()
        right_scroll.setWidget(self._adv_panel)
        right_scroll.setWidgetResizable(True)

        main_layout.addWidget(self._left_stack, 2)
        main_layout.addWidget(middle_scroll, 2)
        main_layout.addWidget(right_scroll, 2)

        # Initialize
        self.race_step.set_items(self.data["Races"])
        self.attr_step.set_items([])
        self.origin_step.set_items(self.data["Origins"])
        self.prof_step.set_items(self.data["Professions"])
        self.path_step.set_items([])
        self.refresh_level_up_sections()

    def open_selector_panel(self, selector):
        self._active_selector = selector
        self._selector_title.setText(selector.default_text)

        while self._selector_options_layout.count():
            item = self._selector_options_layout.takeAt(0)
            widget = item.widget()
            if widget:
                widget.deleteLater()

        for option in selector.items:
            option_btn = QPushButton(selector.render_popup_fn(option))
            option_btn.setStyleSheet("text-align: left; padding: 8px;")
            option_btn.clicked.connect(
                lambda _, s=selector, o=option: self._select_from_panel(s, o)
            )
            self._selector_options_layout.addWidget(option_btn)

        self._left_stack.setCurrentIndex(1)

    def _select_from_panel(self, selector, option):
        selector.set_selected(option)
        self.show_main_controls_panel()

    def show_main_controls_panel(self):
        self._left_stack.setCurrentIndex(0)

    # -------------------------
    # Step Logic
    # -------------------------
    def on_race_selected(self, race):
        race_changed = self._selected_race != race
        self._selected_race = race
        attr_options = race.get("Attributes", [])

        if race_changed:
            self._selected_attr = None
            self.attr_step.set_items(attr_options)

        # Gray out attributes selector when there is only one possible option.
        self.attr_step.selector.setEnabled(len(attr_options) > 1)

        self.update_summary()
        self._adv_panel.refresh()

    def on_attr_selected(self, attr):
        self._selected_attr = attr
        self.update_summary()
        self._adv_panel.refresh()

    def on_origin_selected(self, origin):
        self._selected_origin = origin
        self.update_summary()
        self._adv_panel.refresh()

    def on_prof_selected(self, prof):
        prof_changed = self._selected_prof != prof
        self._selected_prof = prof

        if prof_changed:
            self._selected_path = None
            self.path_step.set_items(prof["Paths"])
            self.reset_level_up_state()

        self.update_summary()
        self._adv_panel.refresh()

    def on_path_selected(self, path):
        self._selected_path = path
        self.update_summary()
        self._adv_panel.refresh()

    def on_level_up_tree_selected(self, slot_index, tree_level_option):
        state = self._level_up_state[slot_index]
        state.select_tree(tree_level_option["tree_name"], tree_level_option["level"])

        self.refresh_level_up_sections()
        self.update_summary()
        self._adv_panel.refresh()

    def on_level_up_version_selected(self, slot_index, version_option):
        self._level_up_state[slot_index].select_version(version_option["index"])

        self.refresh_level_up_sections()
        self.update_summary()
        self._adv_panel.refresh()

    # -------------------------
    # Render Functions
    # -------------------------
    def render_race_button(self, race):
        # MOV, HP and DIV are always shown for races, even when zero/absent.
        keywords = ", ".join(race.get("Keywords", []))
        extras = []
        if keywords:
            extras.append(keywords)
        extras.append(f"MOV: {race.get('MOB', 0)}")
        extras.append(f"HP: {race.get('HP', 0)}")
        extras.append(f"DIV: {race.get('DIV', '-')}")
        return f"{race['Name']}\n" + ", ".join(extras)

    def render_attr_button(self, attr):
        return ", ".join(f"{k} {attr.get(k, 0)}" for k in ATTRIBUTES)

    def render_origin_button(self, origin):
        extras = render_entry_extras(origin)
        return f"{origin['Name']}\n{extras}" if extras else origin["Name"]

    def render_prof_button(self, prof):
        extras = render_entry_extras(prof)
        return f"{prof['Name']}\n{extras}" if extras else prof["Name"]

    def render_path_button(self, path):
        extras = render_entry_extras(path)
        return f"{path['Name']}\n{extras}" if extras else path["Name"]

    def render_level_up_tree_popup(self, option):
        versions = option["versions"]
        if len(versions) == 1:
            detail = format_advancement_summary(versions[0])
        else:
            details = []
            for idx, version in enumerate(versions):
                summary = format_advancement_summary(version)
                details.append(summary)
                if idx < len(versions) - 1:
                    details.append("or")
            detail = "\n".join(details)

        return f"{option['tree_name']} - Level {option['level']}\n{detail}"

    def render_level_up_tree_button(self, option):
        return f"{option['tree_name']} L{option['level']}"

    def render_level_up_version_popup(self, version_option):
        return (
            f"{format_advancement_summary(version_option['entry'])}"
        )

    def render_level_up_version_button(self, version_option):
        summary = format_advancement_summary(version_option["entry"])
        return summary

    # -------------------------
    # Advancement Logic
    # -------------------------
    def reset_level_up_state(self):
        self._level_up_state = build_empty_level_up_state()
        self.refresh_level_up_sections()

    def refresh_level_up_sections(self):
        prior_selected_options = []
        can_fill_slot = self._selected_prof is not None

        for slot_index, section in enumerate(self._level_up_sections):
            state = self._level_up_state[slot_index]

            if can_fill_slot:
                tree_options = self.get_available_level_up_options(
                    slot_index,
                    prior_selected_options
                )
            else:
                tree_options = []

            selected_tree_option = next(
                (option for option in tree_options if state.matches_tree_option(option)),
                None
            )

            if selected_tree_option is None:
                state.clear()

            section.tree_selector.set_items(
                tree_options,
                selected_tree_option
            )
            section.tree_selector.setEnabled(can_fill_slot and bool(tree_options))

            version_options = []
            selected_version_option = None

            if selected_tree_option is not None:
                version_options = self.get_version_options(selected_tree_option)

                if len(version_options) == 1:
                    state.select_version(0)

                selected_version_option = next(
                    (
                        option for option in version_options
                        if option["index"] == state.version_index
                    ),
                    None
                )

                if selected_version_option is None and len(version_options) == 1:
                    selected_version_option = version_options[0]
                elif selected_version_option is None:
                    state.clear_version()
            else:
                state.clear_version()

            section.version_selector.set_items(
                version_options,
                selected_version_option
            )
            section.version_selector.setEnabled(len(version_options) > 1)

            if selected_tree_option is not None:
                prior_selected_options.append(selected_tree_option)

            can_fill_slot = can_fill_slot and section.is_complete()

    def get_available_level_up_options(self, slot_index, prior_selected_options):
        slot_number = slot_index + 1
        tree_names = self.get_accessible_advancement_tree_names()
        taken_levels_by_tree = {}

        for option in prior_selected_options:
            taken_levels_by_tree.setdefault(option["tree_name"], set()).add(option["level"])

        options = []
        for tree_name in tree_names:
            tree = self._trees.get(tree_name)
            if tree is None:
                continue

            taken_levels = taken_levels_by_tree.get(tree_name, set())
            for level_key in sorted(tree["Levels"], key=int):
                level = int(level_key)
                if level in taken_levels:
                    continue

                if self.is_advancement_level_unlocked(level, taken_levels, slot_number):
                    options.append(
                        {
                            "tree_name": tree_name,
                            "level": level,
                            "versions": tree["Levels"][level_key]
                        }
                    )

        return options

    def get_accessible_advancement_tree_names(self):
        if self._selected_prof is None:
            return []

        tree_names = []
        primary_tree_name = self.resolve_primary_tree_name(self._selected_prof["Name"])
        if primary_tree_name in self._trees:
            tree_names.append(primary_tree_name)

        for tree_name in self._selected_prof.get("Advancement Trees", []):
            if (
                tree_name in self._trees
                and tree_name not in tree_names
            ):
                tree_names.append(tree_name)

        return tree_names

    def resolve_primary_tree_name(self, profession_name):
        if profession_name in self._trees:
            return profession_name

        normalized_profession = self.normalize_name(profession_name)
        matches = []

        for tree_name in self._trees:
            normalized_tree = self.normalize_name(tree_name)
            if (
                normalized_profession.startswith(normalized_tree)
                or normalized_tree.startswith(normalized_profession)
            ):
                matches.append((len(normalized_tree), tree_name))

        if matches:
            return max(matches)[1]

        return profession_name

    def normalize_name(self, value):
        return "".join(ch.lower() for ch in value if ch.isalnum())

    def is_advancement_level_unlocked(self, level, taken_levels, slot_number):
        if level == 1:
            return True
        if level in (2, 3):
            return 1 in taken_levels
        if level == 4:
            return 3 in taken_levels
        if level == 5:
            return 3 in taken_levels and slot_number >= 4
        if level == 6:
            return 5 in taken_levels
        if level == 7:
            return 5 in taken_levels and slot_number >= 6
        if level == 8:
            return 7 in taken_levels
        return False

    def get_version_options(self, tree_level_option):
        return [
            {
                "index": index,
                "tree_name": tree_level_option["tree_name"],
                "level": tree_level_option["level"],
                "entry": entry
            }
            for index, entry in enumerate(tree_level_option["versions"])
        ]

    def get_selected_advancement_entries(self):
        entries = []

        for state in self._level_up_state:
            version_index = state.version_index
            if not state.has_tree_selected() or version_index is None:
                continue

            option = self.get_tree_level_option(state.tree_name, state.level)
            if option is None:
                continue

            version_options = self.get_version_options(option)
            if 0 <= version_index < len(version_options):
                entries.append(version_options[version_index]["entry"])

        return entries

    def get_tree_level_option(self, tree_name, level):
        tree = self._trees.get(tree_name)
        if tree is None:
            return None

        level_key = str(level)
        versions = tree["Levels"].get(level_key)
        if versions is None:
            return None

        return {
            "tree_name": tree_name,
            "level": level,
            "versions": versions
        }


    # -------------------------
    # Advancement Tree Summary
    # -------------------------
    def get_advancement_tree_summary(self):
        if self._selected_prof is None:
            return "<span style='color: #888888;'>No profession selected.<br><br>Select a profession to see available advancement trees.</span>"

        tree_names = self.get_accessible_advancement_tree_names()
        if not tree_names:
            return "<span style='color: #888888;'>No advancement trees available for this profession.</span>"

        selected_by_tree = self._build_selected_by_tree()

        html_parts = [
            "<style>",
            "body { font-family: monospace; font-size: 13px; margin: 10px; background-color: white; }",
            ".tree-title { font-size: 13px; font-weight: bold; margin-top: 10px; margin-bottom: 5px; color: #000000; }",
            ".tree-subtitle { font-size: 13px; font-weight: bold; margin-top: 10px; margin-bottom: 5px; color: #000000; }",
            ".level-line { margin-left: 15px; margin-bottom: 5px; }",
            ".version-line { margin-left: 30px; margin-bottom: 3px; font-size: 12px; }",
            ".selected { font-weight: bold; color: #000000; }",
            ".available { font-weight: normal; color: #000000; }",
            ".unavailable { font-weight: normal; color: #888888; }",
            ".level-tag { font-weight: bold; display: inline-block; width: 50px; }",
            "</style>",
            self._render_tree_html(tree_names[0], is_primary=True,  selected_by_tree=selected_by_tree),
        ]
        for tree_name in tree_names[1:]:
            html_parts.append(self._render_tree_html(tree_name, is_primary=False, selected_by_tree=selected_by_tree))

        filled_slots = sum(
            1 for s in self._level_up_state
            if s.is_complete()
        )
        html_parts.append(
            f"<div style='margin-top: 20px; border-top: 1px solid #cccccc; padding-top: 10px; color: #000000;'>"
            f"<span style='font-weight: bold;'>Progress: {filled_slots}/{LEVEL_UP_SLOTS} level ups selected</span>"
            f"</div>"
        )

        return "\n".join(html_parts)

    def _build_selected_by_tree(self):
        """Return {tree_name: {level: version_index}} for all fully-selected level-up slots."""
        selected_by_tree = {}
        for state in self._level_up_state:
            if not state.has_tree_selected() or state.version_index is None:
                continue
            option = self.get_tree_level_option(state.tree_name, state.level)
            if option:
                selected_by_tree.setdefault(option["tree_name"], {})[option["level"]] = state.version_index
        return selected_by_tree

    def _render_tree_html(self, tree_name, is_primary, selected_by_tree):
        """Render a single advancement tree as an HTML fragment."""
        tree = self._trees.get(tree_name)
        if not tree:
            return ""

        title_class = "tree-title" if is_primary else "tree-subtitle"
        result = [f"<div class='{title_class}'>{tree_name}</div>"]

        all_levels = sorted(int(k) for k in tree["Levels"].keys())
        picked = selected_by_tree.get(tree_name, {})
        taken = set(picked.keys())

        available = set()
        simulated_taken = set()
        for level in all_levels:
            if level in taken:
                simulated_taken.add(level)
            elif self.is_advancement_level_unlocked(level, simulated_taken, slot_number=1):
                available.add(level)

        for level in all_levels:
            versions = tree["Levels"][str(level)]

            if level in picked:
                level_class = "selected"
            elif level in available:
                level_class = "available"
            else:
                level_class = "unavailable"

            result.append(f"<div class='level-line {level_class}'><span class='level-tag'>Level {level}</span></div>")

            selected_version_index = picked.get(level, -1)
            for idx, version in enumerate(versions):
                summary = format_advancement_summary(version)
                if idx == selected_version_index:
                    ver_class = "selected"
                elif level in available:
                    ver_class = "available"
                else:
                    ver_class = "unavailable"
                result.append(f"<div class='version-line {ver_class}'>  {summary}</div>")

        return "\n".join(result)
    

    # -------------------------
    # Summary
    # -------------------------
    def update_summary(self):
        stats = self._collect_character_stats()
        self.summary.setHtml(self._render_summary_html(stats))

    def _collect_character_stats(self):
        """Accumulate all character stats from selected race, origin, prof, path and level-ups.

        Returns a plain dict with keys:
            attributes, mob, hp, div_die, brill,
            keyword_counts, items, actions
        """
        attributes = {k: 0 for k in ATTRIBUTES}
        mob = 0
        hp = 0
        div_die = None
        brill = 0
        keyword_counts = {}
        items_by_key = {}
        actions_by_name = {}

        def add_keywords(values):
            for value in values:
                keyword_counts[value] = keyword_counts.get(value, 0) + 1

        def add_item(item):
            items_by_key.setdefault((item["Name"], item["Type"]), item)

        def add_action(action):
            current = actions_by_name.get(action["Name"])
            if current is None or action["Level"] > current["Level"]:
                actions_by_name[action["Name"]] = action

        def apply_entry(entry):
            nonlocal mob, hp, div_die, brill
            for attr in entry.get("Attributes", []):
                for key, value in attr.items():
                    attributes[key] = attributes.get(key, 0) + value
            mob += entry.get("MOB", 0)
            hp += entry.get("HP", 0)
            brill += entry.get("Brill", 0)
            add_keywords(entry.get("Keywords", []))
            div_value = entry.get("DIV")
            if div_value == "Upgrade":
                div_die = upgrade_div_die(div_die)
            elif div_value:
                div_die = div_value
            for item in entry.get("Items", []):
                add_item(item)
            for action in entry.get("Action cards", []):
                add_action(action)

        if self._selected_race is not None:
            race = self._selected_race
            if self._selected_attr is not None:
                for k, v in self._selected_attr.items():
                    attributes[k] += v
            mob = race.get("MOB", 0)
            hp = race.get("HP", 0)
            div_die = race.get("DIV")
            add_keywords(race.get("Keywords", []))
            for action in race.get("Action cards", []):
                add_action(action)

        if self._selected_origin is not None:
            origin = self._selected_origin
            add_keywords(origin.get("Keywords", []))
            for item in origin.get("Items", []):
                add_item(item)
            brill += origin.get("Brill", 0)

        if self._selected_prof is not None:
            add_keywords(self._selected_prof.get("Keywords", []))

        if self._selected_path is not None:
            apply_entry(self._selected_path)

        for entry in self.get_selected_advancement_entries():
            apply_entry(entry)

        return {
            "attributes":     attributes,
            "mob":            mob,
            "hp":             hp,
            "div_die":        div_die,
            "brill":          brill,
            "keyword_counts": keyword_counts,
            "items":          list(items_by_key.values()),
            "actions":        list(actions_by_name.values()),
        }

    def _render_summary_html(self, stats):
        """Render a collected stats dict as an HTML string for the summary panel."""
        parts = [
            "<style>",
            "body { font-family: monospace; font-size: 13px; margin: 10px;"
            " background-color: white; color: #000000; }",
            ".section-title { font-weight: bold; margin-top: 10px; margin-bottom: 3px; }",
            ".line { margin-left: 12px; margin-bottom: 2px; }",
            "</style>",
        ]

        def add_section(title, values):
            if not values:
                return
            parts.append(f"<div class='section-title'>{html.escape(title)}</div>")
            for value in values:
                parts.append(f"<div class='line'>{html.escape(str(value))}</div>")

        add_section(
            "Attributes",
            [f"{k}: {stats['attributes'].get(k, 0)}" for k in ATTRIBUTES]
        )

        stat_lines = [f"MOV: {stats['mob']}", f"HP: {stats['hp']}"]
        if stats["div_die"]:
            stat_lines.append(f"DIV: {stats['div_die']}")
        stat_lines.append(f"Brill: {stats['brill']}")
        add_section("Stats", stat_lines)

        if stats["keyword_counts"]:
            kw_counts = stats["keyword_counts"]
            add_section("Keywords", [
                ", ".join(
                    f"{kw} x{kw_counts[kw]}" if kw_counts[kw] > 1 else kw
                    for kw in sorted(kw_counts)
                )
            ])

        add_section("Items",        [f"{i['Name']} ({i['Type']})" for i in stats["items"]])
        add_section("Action Cards", [f"{a['Name']} (Lvl {a['Level']})" for a in stats["actions"]])

        return "".join(parts)


# -------------------------
# Run App
# -------------------------
if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = CharacterBuilder()
    window.show()
    sys.exit(app.exec())
