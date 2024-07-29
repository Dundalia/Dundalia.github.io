from flask import Flask, request, jsonify
from automata import get_full_image, plot_clean
import matplotlib.pyplot as plt
from io import BytesIO
import base64

app = Flask(__name__)

@app.route('/generate', methods=['POST'])
def generate():
    data = request.get_json()
    nrule = int(data['nrule'])
    niter = int(data['niter'])
    resolution = int(data['resolution'])
    space_ratio = float(data['space_ratio'])
    expl_ratio = float(data['expl_ratio'])
    tag_ratio = float(data['tag_ratio'])
    panoramic = data['panoramic']

    img, expl_rect = get_full_image(nrule, niter, resolution, space_ratio, expl_ratio, tag_ratio, panoramic)
    fig = plot_clean(img, expl_rect=expl_rect, color_rect="white")

    buf = BytesIO()
    fig.savefig(buf, format='png')
    buf.seek(0)
    image_base64 = base64.b64encode(buf.read()).decode('utf-8')
    buf.close()

    plt.close(fig)  # Close the figure to free memory

    return jsonify({'image': image_base64})

if __name__ == '__main__':
    app.run(debug=True)
