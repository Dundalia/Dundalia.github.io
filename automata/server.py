from flask import Flask, request, jsonify
from automata import generate_image

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

    image_base64 = generate_image(nrule, niter, resolution, space_ratio, expl_ratio, tag_ratio, panoramic)

    return jsonify({'image': image_base64})

if __name__ == '__main__':
    app.run(debug=True)
