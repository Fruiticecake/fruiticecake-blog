import sys
import tempfile
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import generator


class CopyStaticTest(unittest.TestCase):
    def test_copies_nested_directories_such_as_post_images(self):
        with tempfile.TemporaryDirectory() as tmp:
            static, public = Path(tmp) / "static", Path(tmp) / "public"
            (static / "images" / "demo").mkdir(parents=True)
            (static / "style.css").write_text("body{}", encoding="utf-8")
            (static / "images" / "demo" / "a.png").write_bytes(b"png")
            public.mkdir()

            generator.copy_static(str(static), str(public))

            self.assertEqual((public / "style.css").read_text(encoding="utf-8"), "body{}")
            self.assertEqual((public / "images" / "demo" / "a.png").read_bytes(), b"png")

    def test_recopy_over_existing_output_succeeds(self):
        with tempfile.TemporaryDirectory() as tmp:
            static, public = Path(tmp) / "static", Path(tmp) / "public"
            (static / "images").mkdir(parents=True)
            (static / "images" / "a.png").write_bytes(b"v2")
            (public / "images").mkdir(parents=True)
            (public / "images" / "a.png").write_bytes(b"v1")

            generator.copy_static(str(static), str(public))

            self.assertEqual((public / "images" / "a.png").read_bytes(), b"v2")


if __name__ == "__main__":
    unittest.main()
