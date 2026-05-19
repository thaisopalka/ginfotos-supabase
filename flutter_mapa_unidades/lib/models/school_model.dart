import 'package:google_maps_cluster_manager/google_maps_cluster_manager.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

class SchoolModel with ClusterItem {
  final String id;
  final String name;
  final String address;
  final String neighborhood;
  final double latitude;
  final double longitude;
  final String? phone;
  final String? directorName;
  final String? schoolType;

  const SchoolModel({
    required this.id,
    required this.name,
    required this.address,
    required this.neighborhood,
    required this.latitude,
    required this.longitude,
    this.phone,
    this.directorName,
    this.schoolType,
  });

  @override
  LatLng get location => LatLng(latitude, longitude);

  LatLng get latLng => LatLng(latitude, longitude);

  String get fullAddress {
    final cleanAddress = address.trim();
    final cleanNeighborhood = neighborhood.trim();
    if (cleanNeighborhood.isEmpty) return cleanAddress;
    return '$cleanAddress - $cleanNeighborhood';
  }

  factory SchoolModel.fromMap(Map<String, dynamic> map) {
    return SchoolModel(
      id: map['id'].toString(),
      name: (map['name'] ?? map['unidade'] ?? map['unidade_escolar'] ?? '').toString(),
      address: (map['address'] ?? map['endereco'] ?? '').toString(),
      neighborhood: (map['neighborhood'] ?? map['bairro'] ?? '').toString(),
      latitude: (map['latitude'] as num).toDouble(),
      longitude: (map['longitude'] as num).toDouble(),
      phone: map['phone']?.toString() ?? map['telefone']?.toString(),
      directorName: map['directorName']?.toString() ?? map['diretor_geral']?.toString(),
      schoolType: map['schoolType']?.toString() ?? map['tipo']?.toString(),
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'name': name,
      'address': address,
      'neighborhood': neighborhood,
      'latitude': latitude,
      'longitude': longitude,
      'phone': phone,
      'directorName': directorName,
      'schoolType': schoolType,
    };
  }
}
