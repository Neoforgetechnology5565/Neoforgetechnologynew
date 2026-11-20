"""PyInstaller entry point (absolute imports so the frozen app starts like `python -m pgengine`)."""
import multiprocessing as mp

from pgengine.__main__ import main

if __name__ == "__main__":
    mp.freeze_support()
    main()
