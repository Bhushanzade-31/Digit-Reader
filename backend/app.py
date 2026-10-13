import io
from pathlib import Path

import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image, ImageOps
from tensorflow import keras

app = Flask(__name__)
CORS(app)
app.config["MAX_CONTENT_LENGTH"] = 5 * 1024 * 1024  # 5 MB

MODEL_PATH = Path(__file__).with_name("mnist_model.keras")


def build_model():
    return keras.Sequential(
        [
            keras.layers.Input(shape=(28, 28)),
            keras.layers.Flatten(),
            keras.layers.Dense(128, activation="relu"),
            keras.layers.Dropout(0.2),
            keras.layers.Dense(10, activation="softmax"),
        ]
    )


def load_or_train_model():
    if MODEL_PATH.exists():
        return keras.models.load_model(MODEL_PATH)

    print("mnist_model.keras not found; training a fallback MNIST model...")
    (x_train, y_train), (x_test, y_test) = keras.datasets.mnist.load_data()
    x_train = x_train.astype("float32") / 255.0
    x_test = x_test.astype("float32") / 255.0
    y_train = keras.utils.to_categorical(y_train, 10)
    y_test = keras.utils.to_categorical(y_test, 10)

    model = build_model()
    model.compile(
        optimizer="adam",
        loss="categorical_crossentropy",
        metrics=["accuracy"],
    )
    model.fit(
        x_train,
        y_train,
        epochs=3,
        batch_size=64,
        validation_data=(x_test, y_test),
        verbose=0,
    )
    model.save(MODEL_PATH)
    return model


model = load_or_train_model()


def preprocess(file_bytes):
    """Turn any uploaded image into a 28x28 MNIST-style array (white digit, black bg)."""
    img = Image.open(io.BytesIO(file_bytes)).convert("L")
    arr = np.array(img)

    # MNIST digits are light on dark. Invert if the image is mostly bright.
    if arr.mean() > 127:
        img = ImageOps.invert(img)
        arr = np.array(img)

    # Crop to the digit, resize to fit 20x20, then center on a 28x28 canvas.
    ys, xs = np.where(arr > 50)
    if len(xs) == 0:
        raise ValueError("No digit found in image")
    img = img.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    img.thumbnail((20, 20), Image.LANCZOS)
    canvas = Image.new("L", (28, 28), 0)
    canvas.paste(img, ((28 - img.width) // 2, (28 - img.height) // 2))

    return np.array(canvas, dtype="float32")[None, ...] / 255.0


@app.route("/api/predict", methods=["POST"])
def predict():
    if "image" not in request.files:
        return jsonify(error="No image uploaded"), 400
    try:
        x = preprocess(request.files["image"].read())
    except ValueError as e:
        return jsonify(error=str(e)), 422
    except Exception:
        return jsonify(error="Invalid image file"), 400

    probs = model.predict(x, verbose=0)[0]
    top = np.argsort(probs)[::-1][:3]
    return jsonify(
        digit=int(top[0]),
        confidence=float(probs[top[0]]),
        top3=[{"digit": int(i), "confidence": float(probs[i])} for i in top],
        caption=f"The digit is {int(top[0])}",
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
