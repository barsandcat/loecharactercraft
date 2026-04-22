import sys
import json
from PyQt6.QtWidgets import (
    QApplication, QWidget, QHBoxLayout, QVBoxLayout,
    QLabel, QTextEdit, QPushButton, QDialog, QScrollArea
)
from PyQt6.QtCore import Qt


# -------------------------
# Selection Popup
# -------------------------
class SelectionPopup(QDialog):
    def __init__(self, items, render_fn, on_select, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Select Option")
        self.resize(350, 450)

        layout = QVBoxLayout(self)

        scroll = QScrollArea()
        container = QWidget()
        vbox = QVBoxLayout(container)

        for item in items:
            btn = QPushButton(render_fn(item))
            btn.setStyleSheet("text-align: left; padding: 8px;")
            btn.clicked.connect(lambda _, i=item: self.select(i, on_select))
            vbox.addWidget(btn)

        scroll.setWidget(container)
        scroll.setWidgetResizable(True)
        layout.addWidget(scroll)

    def select(self, item, callback):
        callback(item)
        self.accept()


# -------------------------
# Selector Button
# -------------------------
class SelectorButton(QPushButton):
    def __init__(self, items, render_popup_fn, render_button_fn, on_change, default_text, parent=None):
        super().__init__(parent)

        self.items = []
        self.render_popup_fn = render_popup_fn
        self.render_button_fn = render_button_fn
        self.on_change = on_change
        self.default_text = default_text

        self.selected = None
        self.setFixedHeight(30)
        self.setStyleSheet("text-align: left; padding: 5px;")
        self.set_items(items)

        self.clicked.connect(self.open_popup)

    def set_items(self, items, selected=None, auto_select_single=True):
        self.items = items
        if selected is not None:
            self.selected = selected
        else:
            self.selected = (
                items[0] if auto_select_single and len(items) == 1 else None
            )
        self.setEnabled(bool(items))
        self.update_text()

    def update_text(self):
        if self.selected:
            self.setText(self.render_button_fn(self.selected))
        else:
            self.setText(self.default_text)

    def open_popup(self):
        if not self.items:
            return

        popup = SelectionPopup(
            self.items,
            self.render_popup_fn,
            self.set_selected,
            self
        )
        popup.exec()

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
        parent=None
    ):
        super().__init__(parent)

        self.level_number = level_number

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(4)

        title = QLabel(f"Level Up {level_number}")
        title.setStyleSheet("font-weight: bold;")
        layout.addWidget(title)

        selectors_layout = QHBoxLayout()
        selectors_layout.setContentsMargins(0, 0, 0, 0)
        selectors_layout.setSpacing(5)

        self.tree_selector = SelectorButton(
            [],
            render_tree_popup_fn,
            render_tree_button_fn,
            on_tree_change,
            "Choose tree and level"
        )
        self.version_selector = SelectorButton(
            [],
            render_version_popup_fn,
            render_version_button_fn,
            on_version_change,
            "Choose version"
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
        parent=None
    ):
        super().__init__(parent)

        self.title = title
        self.render_popup_fn = render_popup_fn
        self.render_button_fn = render_button_fn
        self.on_change = on_change

        self.layout = QVBoxLayout(self)
        self.items = []
        self.selector = SelectorButton(
            [],
            self.render_popup_fn,
            self.render_button_fn,
            self._handle_change,
            self.title
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
# Character Builder
# -------------------------
class CharacterBuilder(QWidget):
    def __init__(self):
        super().__init__()

        self.setWindowTitle("Lands of Evershade - RPG Builder")
        self.resize(1000, 600)

        with open("data.json", "r") as f:
            self.data = json.load(f)

        self.advancement_trees_by_name = {
            tree["Name"]: tree for tree in self.data["Advancement Trees"]
        }
        self.level_up_state = [
            {"tree_level_key": None, "version_index": None}
            for _ in range(12)
        ]

        self.init_ui()

    def init_ui(self):
        main_layout = QHBoxLayout(self)

        left_container = QWidget()
        self.left_layout = QVBoxLayout(left_container)
        self.left_layout.setAlignment(Qt.AlignmentFlag.AlignTop)
        self.left_layout.setSpacing(5)

        # Steps
        self.race_step = StepSection(
            "1. Choose Race",
            self.render_race_popup,
            self.render_race_button,
            self.on_race_selected
        )

        self.attr_step = StepSection(
            "2. Choose Attributes",
            self.render_attr_popup,
            self.render_attr_button,
            self.on_attr_selected
        )

        self.origin_step = StepSection(
            "3. Choose Origin",
            self.render_origin_popup,
            self.render_origin_button,
            self.on_origin_selected
        )

        self.prof_step = StepSection(
            "4. Choose Profession",
            self.render_prof_popup,
            self.render_prof_button,
            self.on_prof_selected
        )

        self.path_step = StepSection(
            "5. Choose Path",
            self.render_path_popup,
            self.render_path_button,
            self.on_path_selected
        )

        self.level_up_sections = []
        for level_number in range(1, 13):
            section = LevelUpSection(
                level_number,
                self.render_level_up_tree_popup,
                self.render_level_up_tree_button,
                self.render_level_up_version_popup,
                self.render_level_up_version_button,
                lambda item, idx=level_number - 1: self.on_level_up_tree_selected(idx, item),
                lambda item, idx=level_number - 1: self.on_level_up_version_selected(idx, item)
            )
            self.level_up_sections.append(section)

        for step in [
            self.race_step,
            self.attr_step,
            self.origin_step,
            self.prof_step,
            self.path_step
        ]:
            self.left_layout.addWidget(step)

        for section in self.level_up_sections:
            self.left_layout.addWidget(section)

        # Summary
        right_layout = QVBoxLayout()
        self.summary = QTextEdit()
        self.summary.setReadOnly(True)

        right_layout.addWidget(QLabel("Character Summary"))
        right_layout.addWidget(self.summary)

        left_scroll = QScrollArea()
        left_scroll.setWidget(left_container)
        left_scroll.setWidgetResizable(True)

        main_layout.addWidget(left_scroll, 1)
        main_layout.addLayout(right_layout, 2)

        # Initialize
        self.race_step.set_items(self.data["Races"])
        self.attr_step.set_items([])
        self.origin_step.set_items(self.data["Origins"])
        self.prof_step.set_items(self.data["Professions"])
        self.path_step.set_items([])
        self.refresh_level_up_sections()

    def clear_selected(self, attr_name):
        if hasattr(self, attr_name):
            delattr(self, attr_name)

    # -------------------------
    # Step Logic
    # -------------------------
    def on_race_selected(self, race):
        race_changed = getattr(self, "selected_race", None) != race
        self.selected_race = race

        if race_changed:
            self.clear_selected("selected_attr")
            self.attr_step.set_items(race["Attributes"])

        self.update_summary()

    def on_attr_selected(self, attr):
        self.selected_attr = attr

        self.update_summary()

    def on_origin_selected(self, origin):
        self.selected_origin = origin

        self.update_summary()

    def on_prof_selected(self, prof):
        prof_changed = getattr(self, "selected_prof", None) != prof
        self.selected_prof = prof

        if prof_changed:
            self.clear_selected("selected_path")
            self.path_step.set_items(prof["Paths"])
            self.reset_level_up_state()

        self.update_summary()

    def on_path_selected(self, path):
        self.selected_path = path
        self.update_summary()

    def on_level_up_tree_selected(self, slot_index, tree_level_option):
        state = self.level_up_state[slot_index]
        state["tree_level_key"] = tree_level_option["key"]
        state["version_index"] = None

        self.refresh_level_up_sections()
        self.update_summary()

    def on_level_up_version_selected(self, slot_index, version_option):
        self.level_up_state[slot_index]["version_index"] = version_option["index"]

        self.refresh_level_up_sections()
        self.update_summary()

    # -------------------------
    # Render Functions
    # -------------------------
    def render_race_popup(self, race):
        attr = race["Attributes"][0]
        return (
            f"{race['Name']}\n"
            f"Keywords: {', '.join(race.get('Keywords', []))}\n"
            f"STR {attr.get('STR',0)} | AGI {attr.get('AGI',0)} | "
            f"INT {attr.get('INT',0)} | CHA {attr.get('CHA',0)}\n"
            f"MOB {race['MOB']} | HP {race['HP']} | DIV {race['DIV']}"
        )

    def render_race_button(self, race):
        return race["Name"]

    def render_attr_popup(self, attr):
        return (
            f"STR {attr.get('STR',0)} | "
            f"AGI {attr.get('AGI',0)} | "
            f"INT {attr.get('INT',0)} | "
            f"CHA {attr.get('CHA',0)}"
        )

    def render_attr_button(self, attr):
        return (
            f"STR {attr.get('STR',0)}, "
            f"AGI {attr.get('AGI',0)}, "
            f"INT {attr.get('INT',0)}, "
            f"CHA {attr.get('CHA',0)}"
        )

    def render_origin_popup(self, origin):
        return (
            f"{origin['Name']}\n"
            f"Keywords: {', '.join(origin['Keywords'])}\n"
            f"Brill: {origin['Brill']}"
        )

    def render_origin_button(self, origin):
        return origin["Name"]

    def render_prof_popup(self, prof):
        return (
            f"{prof['Name']}\n"
            f"Keywords: {', '.join(prof['Keywords'])}"
        )

    def render_prof_button(self, prof):
        return prof["Name"]

    def render_path_popup(self, path):
        attr = path["Attributes"][0]
        key = list(attr.keys())[0]
        return f"{path['Name']}\n+{key}"

    def render_path_button(self, path):
        return path["Name"]

    def render_level_up_tree_popup(self, option):
        versions = option["versions"]
        if len(versions) == 1:
            detail = self.format_advancement_summary(versions[0])
        else:
            # Display all versions with their summaries
            details = []
            for idx, version in enumerate(versions):
                summary = self.format_advancement_summary(version)
                details.append(f"Version {idx + 1}: {summary}")
            detail = "\n".join(details)
        
        return f"{option['tree_name']} - Level {option['level']}\n{detail}"
        
    def render_level_up_tree_button(self, option):
        return f"{option['tree_name']} L{option['level']}"

    def render_level_up_version_popup(self, version_option):
        return (
            f"{version_option['tree_name']} - Level {version_option['level']} "
            f"(Version {version_option['index'] + 1})\n"
            f"{self.format_advancement_summary(version_option['entry'])}"
        )

    def render_level_up_version_button(self, version_option):
        summary = self.format_advancement_summary(version_option["entry"])
        return f"V{version_option['index'] + 1}: {summary}"

    # -------------------------
    # Advancement Logic
    # -------------------------
    def reset_level_up_state(self):
        self.level_up_state = [
            {"tree_level_key": None, "version_index": None}
            for _ in range(12)
        ]
        self.refresh_level_up_sections()

    def refresh_level_up_sections(self):
        prior_selected_options = []
        can_fill_slot = hasattr(self, "selected_prof")

        for slot_index, section in enumerate(self.level_up_sections):
            state = self.level_up_state[slot_index]

            if can_fill_slot:
                tree_options = self.get_available_level_up_options(
                    slot_index,
                    prior_selected_options
                )
            else:
                tree_options = []

            selected_tree_option = next(
                (option for option in tree_options if option["key"] == state["tree_level_key"]),
                None
            )

            if selected_tree_option is None:
                state["tree_level_key"] = None
                state["version_index"] = None

            section.tree_selector.set_items(
                tree_options,
                selected_tree_option,
                auto_select_single=False
            )
            section.tree_selector.setEnabled(can_fill_slot and bool(tree_options))

            version_options = []
            selected_version_option = None

            if selected_tree_option is not None:
                version_options = self.get_version_options(selected_tree_option)

                if len(version_options) == 1:
                    state["version_index"] = 0

                selected_version_option = next(
                    (
                        option for option in version_options
                        if option["index"] == state["version_index"]
                    ),
                    None
                )

                if selected_version_option is None and len(version_options) == 1:
                    selected_version_option = version_options[0]
                elif selected_version_option is None:
                    state["version_index"] = None
            else:
                state["version_index"] = None

            section.version_selector.set_items(
                version_options,
                selected_version_option,
                auto_select_single=True
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
            tree = self.advancement_trees_by_name.get(tree_name)
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
                            "key": f"{tree_name}|{level}",
                            "tree_name": tree_name,
                            "level": level,
                            "versions": tree["Levels"][level_key]
                        }
                    )

        return options

    def get_accessible_advancement_tree_names(self):
        if not hasattr(self, "selected_prof"):
            return []

        tree_names = []
        primary_tree_name = self.resolve_primary_tree_name(self.selected_prof["Name"])
        if primary_tree_name in self.advancement_trees_by_name:
            tree_names.append(primary_tree_name)

        for tree_name in self.selected_prof.get("Advancement Trees", []):
            if (
                tree_name in self.advancement_trees_by_name
                and tree_name not in tree_names
            ):
                tree_names.append(tree_name)

        return tree_names

    def resolve_primary_tree_name(self, profession_name):
        if profession_name in self.advancement_trees_by_name:
            return profession_name

        normalized_profession = self.normalize_name(profession_name)
        matches = []

        for tree_name in self.advancement_trees_by_name:
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
                "key": f"{tree_level_option['key']}|{index}",
                "index": index,
                "tree_name": tree_level_option["tree_name"],
                "level": tree_level_option["level"],
                "entry": entry
            }
            for index, entry in enumerate(tree_level_option["versions"])
        ]

    def get_selected_advancement_entries(self):
        entries = []

        for state in self.level_up_state:
            tree_level_key = state["tree_level_key"]
            version_index = state["version_index"]
            if tree_level_key is None or version_index is None:
                continue

            option = self.get_tree_level_option_by_key(tree_level_key)
            if option is None:
                continue

            version_options = self.get_version_options(option)
            if 0 <= version_index < len(version_options):
                entries.append(version_options[version_index]["entry"])

        return entries

    def get_tree_level_option_by_key(self, tree_level_key):
        tree_name, level_key = tree_level_key.rsplit("|", 1)
        tree = self.advancement_trees_by_name.get(tree_name)
        if tree is None:
            return None

        versions = tree["Levels"].get(level_key)
        if versions is None:
            return None

        return {
            "key": tree_level_key,
            "tree_name": tree_name,
            "level": int(level_key),
            "versions": versions
        }

    def format_advancement_summary(self, entry):
        parts = []

        for attr in entry.get("Attributes", []):
            for key, value in attr.items():
                parts.append(f"+{value} {key}")

        if entry.get("HP"):
            parts.append(f"+{entry['HP']} HP")

        if entry.get("MOB"):
            parts.append(f"+{entry['MOB']} MOB")

        if entry.get("Brill"):
            parts.append(f"+{entry['Brill']} BRILL")

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

    def upgrade_div_die(self, div_die):
        dice_progression = ["D4", "D6", "D8", "D10", "D12"]
        if div_die not in dice_progression:
            return div_die

        current_index = dice_progression.index(div_die)
        if current_index == len(dice_progression) - 1:
            return div_die

        return dice_progression[current_index + 1]

    # -------------------------
    # Summary
    # -------------------------
    def update_summary(self):
        # -------------------------
        # Base values
        # -------------------------
        attributes = {"STR": 0, "AGI": 0, "INT": 0, "CHA": 0}
        mob = 0  # will be shown as MOV
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

        def apply_advancement(entry):
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
                div_die = self.upgrade_div_die(div_die)
            elif div_value:
                div_die = div_value

            for item in entry.get("Items", []):
                add_item(item)

            for action in entry.get("Action cards", []):
                add_action(action)

        # -------------------------
        # Race
        # -------------------------
        if hasattr(self, "selected_race"):
            race = self.selected_race

            # Attributes
            if hasattr(self, "selected_attr"):
                for k, v in self.selected_attr.items():
                    attributes[k] += v

            mob = race.get("MOB", 0)
            hp = race.get("HP", 0)
            div_die = race.get("DIV")

            add_keywords(race.get("Keywords", []))
            for action in race.get("Action cards", []):
                add_action(action)

        # -------------------------
        # Origin
        # -------------------------
        if hasattr(self, "selected_origin"):
            origin = self.selected_origin

            add_keywords(origin.get("Keywords", []))
            for item in origin.get("Items", []):
                add_item(item)
            brill += origin.get("Brill", 0)

        # -------------------------
        # Profession
        # -------------------------
        if hasattr(self, "selected_prof"):
            prof = self.selected_prof
            add_keywords(prof.get("Keywords", []))

        # -------------------------
        # Path
        # -------------------------
        if hasattr(self, "selected_path"):
            path = self.selected_path

            # Attribute bonuses
            for attr in path.get("Attributes", []):
                for k, v in attr.items():
                    attributes[k] = attributes.get(k, 0) + v

            for item in path.get("Items", []):
                add_item(item)
            for action in path.get("Action cards", []):
                add_action(action)

        # -------------------------
        # Level Ups
        # -------------------------
        for entry in self.get_selected_advancement_entries():
            apply_advancement(entry)

        # -------------------------
        # Deduplicate
        # -------------------------
        unique_items = items_by_key.values()
        unique_actions = actions_by_name.values()

        # -------------------------
        # Build output
        # -------------------------
        lines = []

        # Attributes
        lines.append("ATTRIBUTES")
        lines.append(f"STR: {attributes.get('STR', 0)}")
        lines.append(f"AGI: {attributes.get('AGI', 0)}")
        lines.append(f"INT: {attributes.get('INT', 0)}")
        lines.append(f"CHA: {attributes.get('CHA', 0)}")
        lines.append("")

        # Core stats
        lines.append("STATS")
        lines.append(f"MOV: {mob}")
        lines.append(f"HP: {hp}")
        if div_die:
            lines.append(f"DIV: {div_die}")
        lines.append(f"BRILL: {brill}")
        lines.append("")

        # Keywords
        if keyword_counts:
            lines.append("KEYWORDS")
            lines.append(
                ", ".join(
                    (
                        f"{keyword} x{keyword_counts[keyword]}"
                        if keyword_counts[keyword] > 1
                        else keyword
                    )
                    for keyword in sorted(keyword_counts)
                )
            )
            lines.append("")

        # Items
        if unique_items:
            lines.append("ITEMS")
            for item in unique_items:
                lines.append(f"{item['Name']} ({item['Type']})")
            lines.append("")

        # Actions
        if unique_actions:
            lines.append("ACTION CARDS")
            for act in unique_actions:
                lines.append(f"{act['Name']} (Lvl {act['Level']})")
            lines.append("")

        self.summary.setText("\n".join(lines))


# -------------------------
# Run App
# -------------------------
if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = CharacterBuilder()
    window.show()
    sys.exit(app.exec())
