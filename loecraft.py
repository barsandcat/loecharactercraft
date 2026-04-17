import sys
import json
from PyQt6.QtWidgets import (
    QApplication, QWidget, QHBoxLayout, QVBoxLayout,
    QLabel, QComboBox, QTextEdit
)


class CharacterBuilder(QWidget):
    def __init__(self):
        super().__init__()

        self.setWindowTitle("Lands of Evershade - Character Builder")
        self.resize(800, 500)

        # Load data
        with open("data.json", "r") as f:
            self.data = json.load(f)

        self.races = self.data["Races"]

        self.init_ui()

    def init_ui(self):
        main_layout = QHBoxLayout(self)

        # LEFT SIDE (choices)
        left_layout = QVBoxLayout()

        # Race selection
        self.race_label = QLabel("Select Race:")
        self.race_combo = QComboBox()
        self.race_combo.addItems([race["Name"] for race in self.races])
        self.race_combo.currentIndexChanged.connect(self.on_race_changed)

        # Attribute selection
        self.attr_label = QLabel("Select Attribute Variant:")
        self.attr_combo = QComboBox()
        self.attr_combo.currentIndexChanged.connect(self.update_summary)

        left_layout.addWidget(self.race_label)
        left_layout.addWidget(self.race_combo)
        left_layout.addWidget(self.attr_label)
        left_layout.addWidget(self.attr_combo)

        # RIGHT SIDE (summary)
        right_layout = QVBoxLayout()
        self.summary = QTextEdit()
        self.summary.setReadOnly(True)

        right_layout.addWidget(QLabel("Summary"))
        right_layout.addWidget(self.summary)

        # Add to main layout
        main_layout.addLayout(left_layout, 1)
        main_layout.addLayout(right_layout, 2)

        # Initialize
        self.on_race_changed()

    def on_race_changed(self):
        race_index = self.race_combo.currentIndex()
        race = self.races[race_index]

        self.attr_combo.clear()

        # Populate attribute variants
        for i, attr in enumerate(race["Attributes"]):
            label = f"Option {i+1}: STR {attr.get('STR',0)}, AGI {attr.get('AGI',0)}, INT {attr.get('INT',0)}, CHA {attr.get('CHA',0)}"
            self.attr_combo.addItem(label)

        self.update_summary()

    def update_summary(self):
        race_index = self.race_combo.currentIndex()
        attr_index = self.attr_combo.currentIndex()

        race = self.races[race_index]
        attributes = race["Attributes"][attr_index]

        text = f"Race: {race['Name']}\n"
        text += f"Keywords: {', '.join(race.get('Keywords', []))}\n\n"

        text += "Attributes:\n"
        for k, v in attributes.items():
            text += f"  {k}: {v}\n"

        text += "\nOther Stats:\n"
        text += f"  MOB: {race.get('MOB')}\n"
        text += f"  DIV: {race.get('DIV')}\n"
        text += f"  HP: {race.get('HP')}\n"

        self.summary.setText(text)


if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = CharacterBuilder()
    window.show()
    sys.exit(app.exec())
