from setuptools import setup


setup(
    name='IPVizualizator',
    version='0.11',
    description='IPVizualizator is an interactive heatmap which represents values assigned to IP addresses using Hilbert curve.',
    author='Jakub Jancicka',
    author_email='jancijak@fit.cvut.cz',
    license='Public Domain',
    packages=['IPVizualizator'],
    package_data={'IPVizualizator': ['api/*.yaml']},
    entry_points={
        'console_scripts': [
            'IPVizualizator = IPVizualizator.IPVizualizator:main',
        ],
    },
    install_requires=['connexion[swagger-ui]','flask_cors']
)
