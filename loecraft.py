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

        self.items = items
        self.render_popup_fn = render_popup_fn
        self.render_button_fn = render_button_fn
        self.on_change = on_change
        self.default_text = default_text

        self.selected = items[0] if len(items) == 1 else None
        self.setFixedHeight(30)
        self.setStyleSheet("text-align: left; padding: 5px;")
        self.update_text()

        self.clicked.connect(self.open_popup)

    def update_text(self):
        if self.selected:
            self.setText(self.render_button_fn(self.selected))
        else:
            self.setText(self.default_text)

    def open_popup(self):
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


# -------------------------
# Step Section (Locked Flow)
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

        self.selector = None
        self.items = []

        self.locked = True
        self.update_visual_state()

    def set_locked(self, locked=True):
        self.locked = locked
        self.update_visual_state()

    def update_visual_state(self):
        if self.locked:
            self.setEnabled(False)
            self.setStyleSheet("opacity: 0.5;")
        else:
            self.setEnabled(True)
            self.setStyleSheet("")

    def set_items(self, items):
        self.items = items

        if self.selector:
            self.layout.removeWidget(self.selector)
            self.selector.deleteLater()
            self.selector = None

        if not items:
            return

        self.selector = SelectorButton(
            items,
            self.render_popup_fn,
            self.render_button_fn,
            self._handle_change,
            self.title
        )

        self.layout.addWidget(self.selector)

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

        self.init_ui()

    def init_ui(self):
        main_layout = QHBoxLayout(self)

        self.left_layout = QVBoxLayout()
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

        for step in [
            self.race_step,
            self.attr_step,
            self.origin_step,
            self.prof_step,
            self.path_step
        ]:
            self.left_layout.addWidget(step)

        # Summary
        right_layout = QVBoxLayout()
        self.summary = QTextEdit()
        self.summary.setReadOnly(True)

        right_layout.addWidget(QLabel("Character Summary"))
        right_layout.addWidget(self.summary)

        main_layout.addLayout(self.left_layout, 1)
        main_layout.addLayout(right_layout, 2)

        # Initialize
        self.race_step.set_items(self.data["Races"])
        self.race_step.set_locked(False)

    # -------------------------
    # Step Logic
    # -------------------------
    def on_race_selected(self, race):
        self.selected_race = race

        self.origin_step.set_locked(True)
        self.prof_step.set_locked(True)
        self.path_step.set_locked(True)

        self.attr_step.set_items(race["Attributes"])
        self.attr_step.set_locked(False)

        self.update_summary()

    def on_attr_selected(self, attr):
        self.selected_attr = attr

        self.prof_step.set_locked(True)
        self.path_step.set_locked(True)

        self.origin_step.set_items(self.data["Origins"])
        self.origin_step.set_locked(False)

        self.update_summary()

    def on_origin_selected(self, origin):
        self.selected_origin = origin

        self.path_step.set_locked(True)

        self.prof_step.set_items(self.data["Proffesions"])
        self.prof_step.set_locked(False)

        self.update_summary()

    def on_prof_selected(self, prof):
        self.selected_prof = prof

        self.path_step.set_items(prof["Paths"])
        self.path_step.set_locked(False)

        self.update_summary()

    def on_path_selected(self, path):
        self.selected_path = path
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

        keywords = set()
        items = []
        actions = []

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

            keywords.update(race.get("Keywords", []))
            actions.extend(race.get("Action cards", []))

        # -------------------------
        # Origin
        # -------------------------
        if hasattr(self, "selected_origin"):
            origin = self.selected_origin

            keywords.update(origin.get("Keywords", []))
            items.extend(origin.get("Items", []))
            brill += origin.get("Brill", 0)

        # -------------------------
        # Profession
        # -------------------------
        if hasattr(self, "selected_prof"):
            prof = self.selected_prof
            keywords.update(prof.get("Keywords", []))

        # -------------------------
        # Path
        # -------------------------
        if hasattr(self, "selected_path"):
            path = self.selected_path

            # Attribute bonuses
            for attr in path.get("Attributes", []):
                for k, v in attr.items():
                    attributes[k] = attributes.get(k, 0) + v

            items.extend(path.get("Items", []))
            actions.extend(path.get("Action cards", []))

        # -------------------------
        # Deduplicate
        # -------------------------
        unique_items = {(i["Name"], i["Type"]): i for i in items}.values()
        unique_actions = {(a["Name"], a["Level"]): a for a in actions}.values()

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
        if keywords:
            lines.append("KEYWORDS")
            lines.append(", ".join(sorted(keywords)))
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